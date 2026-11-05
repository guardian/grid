import { GRID_ROW_HEIGHT } from "@/constants/layout";
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
  itemOffset?: number;
  itemCount?: number;
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

export function getLayoutRow(value: LayoutGeometry, rowIndex: number): LayoutRow {
  if ("layout" in value) return value.layout.getRow(rowIndex);
  const firstItemIndex = rowIndex * value.columns - (value.itemOffset ?? 0) % value.columns;
  return { index: rowIndex, top: rowIndex * value.rowHeight, height: value.rowHeight,
    firstItemIndex: Math.max(0, firstItemIndex),
    lastItemIndex: Math.min((value.itemCount ?? Infinity) - 1, firstItemIndex + value.columns - 1) };
}

export function getItemLayoutRow(value: LayoutGeometry, itemIndex: number): LayoutRow {
  return "layout" in value ? value.layout.getItemRow(itemIndex)
    : getLayoutRow(value, Math.floor((itemIndex + (value.itemOffset ?? 0) % value.columns) / value.columns));
}

export function getFixedRowCount(value: FixedRowGeometry, itemCount: number): number {
  return itemCount > 0 ? Math.ceil((itemCount + (value.itemOffset ?? 0) % value.columns) / value.columns) : 0;
}

export function getItemColumn(value: FixedRowGeometry, itemIndex: number): number {
  return (itemIndex + (value.itemOffset ?? 0) % value.columns) % value.columns;
}


