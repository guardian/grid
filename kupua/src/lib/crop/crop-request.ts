/**
 * Maps an engine selection to Kahuna's cropper-service request.
 *
 * Engines report a rectangle in the displayed rendition's natural pixels. The
 * rendition is already rotated by EXIF orientation, so it shares the oriented
 * original's aspect; Kahuna sends coordinates in oriented-original pixels
 * (source.orientedDimensions, else source.dimensions).
 */

import type { Image } from "@/types/image";
import { SQUARE_KEY, type CropOption } from "./crop-options";

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Size {
  width: number;
  height: number;
}

/** Kahuna warns below this crop width (crop/controller.js). */
export const MIN_RECOMMENDED_CROP_WIDTH = 1000;

export function isValidCropRect(rect: Rect, size: Size): boolean {
  return [rect.x, rect.y, rect.width, rect.height, size.width, size.height].every(Number.isFinite)
    && size.width > 0 && size.height > 0 && rect.width > 0 && rect.height > 0
    && rect.x >= 0 && rect.y >= 0
    && rect.x + rect.width <= size.width && rect.y + rect.height <= size.height;
}

/** Maximal centred frame, matching the crop canvas's initial selection. */
export function defaultCropRect(size: Size, aspect: number | null): Rect {
  let { width, height } = size;
  if (aspect) {
    if (width / height > aspect) width = height * aspect;
    else height = width / aspect;
  }
  return { x: (size.width - width) / 2, y: (size.height - height) / 2, width, height };
}

export function originalCropSize(image: Image): Size | undefined {
  const dims = image.source?.orientedDimensions ?? image.source?.dimensions;
  return dims && isValidCropRect({ x: 0, y: 0, ...dims }, dims) ? dims : undefined;
}

export function toOriginalRect(selection: Rect, rendition: Size, original: Size, cropKey: string): Rect {
  const sx = original.width / rendition.width;
  const sy = original.height / rendition.height;
  const x = clamp(Math.round(selection.x * sx), 0, original.width - 1);
  const y = clamp(Math.round(selection.y * sy), 0, original.height - 1);
  let width = clamp(Math.round(selection.width * sx), 1, original.width - x);
  let height = clamp(Math.round(selection.height * sy), 1, original.height - y);
  // Square: one side only, removing client rounding jitter (Kahuna does the same).
  if (cropKey === SQUARE_KEY) width = height = Math.min(width, height);
  return { x, y, width, height };
}

export function cropCoordinateLimits(rect: Rect, field: keyof Rect, original: Size, aspect: number | null): { min: number; max: number } {
  if (field === "x") return { min: 0, max: original.width - rect.width };
  if (field === "y") return { min: 0, max: original.height - rect.height };
  const availableWidth = original.width - rect.x;
  const availableHeight = original.height - rect.y;
  return { min: 1, max: Math.max(1, field === "width"
    ? aspect ? Math.min(availableWidth, Math.round(availableHeight * aspect)) : availableWidth
    : aspect ? Math.min(availableHeight, Math.round(availableWidth / aspect)) : availableHeight) };
}

export function editCropRect(rect: Rect, field: keyof Rect, value: number, original: Size, aspect: number | null): Rect {
  if (!Number.isFinite(value)) return rect;
  const next = { ...rect };
  const availableWidth = original.width - rect.x;
  const availableHeight = original.height - rect.y;
  const { min, max } = cropCoordinateLimits(rect, field, original, aspect);
  if (field === "x") next.x = clamp(Math.round(value), min, max);
  else if (field === "y") next.y = clamp(Math.round(value), min, max);
  else if (field === "width") {
    next.width = clamp(Math.round(value), min, max);
    if (aspect) next.height = clamp(Math.round(next.width / aspect), 1, availableHeight);
  } else {
    next.height = clamp(Math.round(value), min, max);
    if (aspect) next.width = clamp(Math.round(next.height * aspect), 1, availableWidth);
  }
  return next;
}

export interface CropRequest {
  type: "crop";
  source: string;
  x: number;
  y: number;
  width: number;
  height: number;
  aspectRatio?: string;
}

export function buildCropRequest(sourceUri: string, rect: Rect, option: CropOption): CropRequest {
  return { type: "crop", source: sourceUri, ...rect, aspectRatio: option.ratioString };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
