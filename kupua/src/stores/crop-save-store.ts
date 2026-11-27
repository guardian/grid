import { create } from "zustand";
import { z } from "zod";
import type { ImageByIdResult } from "@/dal/types";
import { apiGetImage, SearchAfterApiError } from "@/dal/grid-api-search-adapter";
import { executeGridCommand, observeSavedCrop, showsSavedCrop, type CropReceipt } from "@/lib/grid-commands";
import { invalidateGridSession, isGridSessionInvalidated } from "@/lib/grid-api-instance";
import { isImageMetadataCurrent } from "@/lib/image-read-freshness";
import { hasNewerImageCopy, publishImages, tagStandalonePublication } from "@/lib/image-publication";
import type { CropRequest } from "@/lib/crop/crop-request";
import type { CropDraft } from "@/lib/crop/crop-draft";
import { addToast } from "./toast-store";
import { CROP_SAVE_TIMEOUT_MS, CROP_UNCERTAIN_LOCK_MS } from "@/constants/tuning";

const STORAGE_KEY = "kupua.crop.saving";
const LOCKS_KEY = "kupua.crop.locks";
const locksSchema = z.array(z.object({ imageId: z.string(), until: z.number() }));
export const CROP_RESUME_MS = CROP_SAVE_TIMEOUT_MS;
const RESUME_WAITS = [0, 1000, 2000, 4000, 8000, 15_000, 30_000];

const rectSchema = z.object({ x: z.number(), y: z.number(), width: z.number(), height: z.number() });
const persistedSchema = z.array(z.object({
  imageId: z.string(), startedAt: z.number(), expectedId: z.string(), priorDate: z.string().nullable(),
  frame: z.object({ version: z.literal(1), imageId: z.string(), size: z.object({ width: z.number(), height: z.number() }),
    cropKey: z.string(), ratio: z.number().nullable(), rect: rectSchema.nullable(), defaultRect: rectSchema.optional(),
    priorFrameEdits: z.boolean().optional() }),
  receipt: z.object({ id: z.string(), date: z.string() }).optional(),
  /** Set once the outcome is unknown: the image stays locked until then, without waiting for a crop. */
  lockedUntil: z.number().optional(),
}));

type Manual = z.infer<typeof persistedSchema>[number];
export type CropSave = { phase: "saving" | "uncertain"; manual?: Manual; until?: number };

interface CropSaveState { saves: ReadonlyMap<string, CropSave> }

export const useCropSaveStore = create<CropSaveState>(() => ({ saves: new Map() }));

const landed = new Map<string, (result: ImageByIdResult, cropId: string) => void>();

function persist() {
  const entries = [...useCropSaveStore.getState().saves.entries()];
  const manual = entries.flatMap(([, save]) => save.manual ? [save.manual] : []);
  const locks = entries.flatMap(([imageId, save]) => !save.manual && save.until !== undefined ? [{ imageId, until: save.until }] : []);
  try {
    if (manual.length) sessionStorage.setItem(STORAGE_KEY, JSON.stringify(manual));
    else sessionStorage.removeItem(STORAGE_KEY);
    if (locks.length) sessionStorage.setItem(LOCKS_KEY, JSON.stringify(locks));
    else sessionStorage.removeItem(LOCKS_KEY);
  } catch { /* storage unavailable: the save still runs, only reload resumption is lost */ }
}

function put(imageId: string, save: CropSave | undefined) {
  useCropSaveStore.setState(state => {
    const saves = new Map(state.saves);
    if (save) saves.set(imageId, save); else saves.delete(imageId);
    return { saves };
  });
  persist();
}

export function isCropBusy(imageId: string): boolean {
  return useCropSaveStore.getState().saves.has(imageId);
}

/** Claims the image for one crop write; false when another crop for it is saving or uncertain. */
export function beginCropSave(imageId: string, manual?: Manual): boolean {
  if (isCropBusy(imageId)) return false;
  put(imageId, { phase: "saving", manual });
  return true;
}

export function finishCropSave(imageId: string, uncertain: boolean, until = Date.now() + CROP_UNCERTAIN_LOCK_MS) {
  if (!uncertain) { put(imageId, undefined); return; }
  const previous = useCropSaveStore.getState().saves.get(imageId)?.manual;
  const save: CropSave = { phase: "uncertain", until, ...(previous && { manual: { ...previous, lockedUntil: until } }) };
  put(imageId, save);
  setTimeout(() => { if (useCropSaveStore.getState().saves.get(imageId) === save) put(imageId, undefined); }, Math.max(0, until - Date.now()));
}

/** The open editor for an image receives its landed crop; otherwise the publication alone updates Detail. */
export function onCropLanded(imageId: string, handler: (result: ImageByIdResult, cropId: string) => void) {
  landed.set(imageId, handler);
  return () => { if (landed.get(imageId) === handler) landed.delete(imageId); };
}

function land(imageId: string, result: ImageByIdResult, cropId: string) {
  if (isGridSessionInvalidated() || !isImageMetadataCurrent(result.image)) return false;
  // A later read (e.g. a confirmed collection edit) already includes this crop; keep it.
  if (!hasNewerImageCopy(result.image)) publishImages([result]);
  landed.get(imageId)?.(result, cropId);
  return true;
}

export function saveCrop(imageId: string, request: CropRequest, frame: CropDraft, priorDate: string | null): boolean {
  const expectedId = `${request.x}_${request.y}_${request.width}_${request.height}`;
  const manual: Manual = { imageId, startedAt: Date.now(), expectedId, priorDate, frame };
  if (!beginCropSave(imageId, manual)) {
    addToast({ category: "information", message: "A crop is already being saved for this image" });
    return false;
  }
  void (async () => {
    let uncertain = false;
    try {
      const result = await executeGridCommand({ operation: "create-crop", imageId, request });
      uncertain = result.outcome === "unknown";
      if (result.outcome === "acknowledged" && result.crop) {
        put(imageId, { phase: "saving", manual: { ...manual, receipt: result.crop } });
        const receipt = result.crop;
        const readback = tagStandalonePublication(await observeSavedCrop(imageId, receipt));
        if (!readback || !land(imageId, readback, result.crop.id)) addToast({ category: "warning", message: "Crop saved but not yet visible" });
      } else {
        addToast({ category: "warning", message: uncertain ? "Could not confirm whether the crop was saved"
          : result.outcome === "rejected" ? "Grid rejected the crop" : "Crop was not sent" });
      }
    } catch {
      uncertain = true;
      addToast({ category: "warning", message: "Could not confirm whether the crop was saved" });
    } finally {
      finishCropSave(imageId, uncertain);
    }
  })();
  return true;
}

function matches(result: ImageByIdResult, save: Manual): CropReceipt | undefined {
  // Grid appends repeat saves, so only an export newer than every pre-save copy can be this save.
  const crop = save.receipt ? result.image.exports?.find(item => item.id === save.receipt!.id && item.date === save.receipt!.date)
    : result.image.exports?.find(item => item.id === save.expectedId && item.date && (save.priorDate === null || Date.parse(item.date) > Date.parse(save.priorDate)));
  const receipt = crop?.id && crop.date ? { id: crop.id, date: crop.date } : undefined;
  return receipt && showsSavedCrop(result.image, result.enrichment, receipt) ? receipt : undefined;
}

/** A reload can restore the crop page before its editor mounts; give it a moment to receive the crop. */
async function editorMounted(imageId: string) {
  const params = new URLSearchParams(location.search);
  if (params.get("cropping") !== "true" || params.get("image") !== imageId) return;
  for (let waited = 0; !landed.has(imageId) && waited < 10_000; waited += 250) await new Promise(resolve => setTimeout(resolve, 250));
}

async function resume(save: Manual) {
  const deadline = save.startedAt + CROP_RESUME_MS;
  for (let attempt = 0; Date.now() < deadline && !isGridSessionInvalidated(); attempt++) {
    await new Promise(resolve => setTimeout(resolve, RESUME_WAITS[Math.min(attempt, RESUME_WAITS.length - 1)]));
    try {
      const result = tagStandalonePublication(await apiGetImage(save.imageId, AbortSignal.timeout(5000)));
      const receipt = result && matches(result, save);
      if (result && receipt) {
        await editorMounted(save.imageId);
        if (land(save.imageId, result, receipt.id)) { finishCropSave(save.imageId, false); return; }
      }
    } catch (error) {
      if (error instanceof SearchAfterApiError && (error.status === 401 || error.status === 419)) {
        invalidateGridSession();
        finishCropSave(save.imageId, false);
        return;
      }
    }
  }
  addToast({ category: "warning", message: "Could not confirm whether the crop was saved" });
  finishCropSave(save.imageId, false);
}

/** After reload, wait again for manual crops this tab submitted; nothing is resent. */
export function resumeCropSaves() {
  let stored: Manual[] = [];
  try { stored = persistedSchema.catch([]).parse(JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "[]")); } catch { /* ignore */ }
  let locks: z.infer<typeof locksSchema> = [];
  try { locks = locksSchema.catch([]).parse(JSON.parse(sessionStorage.getItem(LOCKS_KEY) ?? "[]")); } catch { /* ignore */ }
  for (const { imageId, until } of locks) {
    if (until > Date.now() && !isCropBusy(imageId)) finishCropSave(imageId, true, until);
  }
  for (const save of stored) {
    if (isCropBusy(save.imageId)) continue;
    if (save.lockedUntil !== undefined) {
      if (save.lockedUntil > Date.now()) {
        put(save.imageId, { phase: "saving", manual: save });
        finishCropSave(save.imageId, true, save.lockedUntil);
      }
      continue;
    }
    if (Date.now() >= save.startedAt + CROP_RESUME_MS) continue;
    put(save.imageId, { phase: "saving", manual: save });
    void resume(save);
  }
  persist();
}

export function resetCropSavesForTests() {
  landed.clear();
  useCropSaveStore.setState({ saves: new Map() });
  try { sessionStorage.removeItem(STORAGE_KEY); sessionStorage.removeItem(LOCKS_KEY); } catch { /* ignore */ }
}
