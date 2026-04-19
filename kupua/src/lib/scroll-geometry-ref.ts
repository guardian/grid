/**
 * scroll-geometry-ref — shared ref for the active scroll geometry.
 *
 * The density components (ImageGrid, ImageTable) register their current
 * geometry here whenever it changes (columns, row height). Other modules
 * (e.g. search-store extend paths) read it to compute pixel offsets
 * outside of React's render cycle.
 *
 * Same pattern as scroll-container-ref.ts: module-level mutable ref,
 * zero React, zero prop-drilling.
 */

import { GRID_ROW_HEIGHT } from "@/constants/layout";

export interface ScrollGeometrySnapshot {
  rowHeight: number;
  columns: number;
}

let _geo: ScrollGeometrySnapshot = { rowHeight: GRID_ROW_HEIGHT, columns: 1 };

/** Register the current scroll geometry. Call on mount and when columns change. */
export function registerScrollGeometry(geo: ScrollGeometrySnapshot): void {
  _geo = geo;
}

/** Get the currently registered scroll geometry. */
export function getScrollGeometry(): ScrollGeometrySnapshot {
  return _geo;
}


