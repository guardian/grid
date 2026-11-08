import { z } from "zod";
import { isValidCropRect, type Size } from "./crop-request";
import type { CropSettings } from "./crop-options";

const STORAGE_KEY = "kupua.crop.draft";
const rectSchema = z.object({ x: z.number().nonnegative(), y: z.number().nonnegative(),
  width: z.number().positive(), height: z.number().positive() });
const draftSchema = z.object({
  version: z.literal(1),
  imageId: z.string(),
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  cropKey: z.string(),
  ratio: z.number().positive().nullable(),
  rect: rectSchema.nullable(),
  defaultRect: rectSchema.optional(),
  priorFrameEdits: z.boolean().optional(),
});

export type CropDraft = z.infer<typeof draftSchema>;

let pending: CropDraft | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;

function storedDraft(): CropDraft | undefined {
  try {
    const parsed = draftSchema.safeParse(pending ?? JSON.parse(sessionStorage.getItem(STORAGE_KEY) ?? "null"));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function readCropDraft(imageId: string, size: Size | undefined, settings: CropSettings): CropDraft | undefined {
  const draft = storedDraft();
  if (!draft || !size || draft.imageId !== imageId || draft.size.width !== size.width || draft.size.height !== size.height
    || !settings.options.some(option => option.key === draft.cropKey && option.ratio === draft.ratio)
    || (draft.rect !== null && !isValidCropRect(draft.rect, size))
    || (draft.defaultRect && !isValidCropRect(draft.defaultRect, size))) return undefined;
  return draft;
}

export function flushCropDraft(): void {
  clearTimeout(timer);
  timer = undefined;
  if (!pending) return;
  const draft = pending;
  pending = undefined;
  try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(draft)); } catch {}
}

export function queueCropDraft(draft: CropDraft): void {
  pending = draft;
  timer ??= setTimeout(flushCropDraft, 100);
}

export function clearCropDraft(): void {
  clearTimeout(timer);
  timer = undefined;
  pending = undefined;
  try { sessionStorage.removeItem(STORAGE_KEY); } catch {}
}

export function discardCropDraftOutside(search: string): void {
  const params = new URLSearchParams(search);
  const imageId = params.get("image");
  if (params.get("cropping") !== "true" || !imageId || storedDraft()?.imageId !== imageId) clearCropDraft();
}