import { GRID_ROW_HEIGHT } from "@/constants/layout";
import { alignBufferStart } from "@/lib/buffer-column-align";
import type { Image } from "@/types/image";

export interface WindowSeekInput {
  images: readonly (Image | undefined)[];
  bufferOffset: number;
  total: number;
  backwardItemCount: number;
  clampedOffset: number;
  scrollTop: number;
  clientHeight: number;
}

export interface WindowGeometry {
  width: number;
  getItemId: (index: number) => string | undefined;
  findItemIndex: (id: string) => number | undefined;
  rowAtOffset: (offset: number) => LayoutRow | undefined;
  prepareSeek: (input: WindowSeekInput) => { scrollTargetIndex: number; seekSubRowOffset: number };
}

export interface SpatialNavigation {
  getRow: (index: number) => LayoutRow;
  getItemRow: (index: number) => LayoutRow;
  rowAtOffset: (offset: number) => LayoutRow | undefined;
  neighbour: (itemIndex: number, rowIndex: number) => number;
}

export interface FixedRowGeometry {
  rowHeight: number;
  columns: number;
}

export interface LayoutRow {
  index: number;
  top: number;
  height: number;
  firstItemIndex: number;
  lastItemIndex: number;
}

/** Logical coordinates exclude header flow and container padding. */
export type LayoutGeometry = (FixedRowGeometry | {
  window?: WindowGeometry;
  spatial?: SpatialNavigation;
  layout: {
    // Resident geometry is exact; windowed layouts explicitly own unloaded estimates.
    getRow: (rowIndex: number) => LayoutRow;
    getItemRow: (itemIndex: number) => LayoutRow;
  };
}) & { headerOffset?: number };

let geometry: LayoutGeometry = { rowHeight: GRID_ROW_HEIGHT, columns: 1 };

export function registerScrollGeometry(next: LayoutGeometry): void {
  geometry = next;
}

export function getLayoutGeometry(): LayoutGeometry {
  return geometry;
}

/** Window preparation is still fixed-row-only; never expose stale or fabricated scalars. */
export function requireFixedRowGeometry(value: LayoutGeometry): FixedRowGeometry {
  if ("layout" in value) throw new Error("Window preparation requires fixed-row geometry");
  return value;
}

export function getScrollGeometry(): FixedRowGeometry {
  return requireFixedRowGeometry(geometry);
}

export function alignWindowStart(rawOffset: number, availableCount: number, protectUpTo = availableCount) {
  if ("layout" in geometry && geometry.window) return { alignedOffset: rawOffset, trimCount: 0 };
  return alignBufferStart(rawOffset, availableCount, requireFixedRowGeometry(geometry).columns, protectUpTo);
}

export function windowEvictionCount(required: number): number {
  if ("layout" in geometry && geometry.window) return required;
  const { columns } = requireFixedRowGeometry(geometry);
  return Math.ceil(required / columns) * columns;
}

export function getLayoutRow(value: LayoutGeometry, rowIndex: number): LayoutRow {
  if ("layout" in value) return value.layout.getRow(rowIndex);
  return { index: rowIndex, top: rowIndex * value.rowHeight, height: value.rowHeight,
    firstItemIndex: rowIndex * value.columns, lastItemIndex: (rowIndex + 1) * value.columns - 1 };
}

export function getItemLayoutRow(value: LayoutGeometry, itemIndex: number): LayoutRow {
  return "layout" in value ? value.layout.getItemRow(itemIndex)
    : getLayoutRow(value, Math.floor(itemIndex / value.columns));
}


