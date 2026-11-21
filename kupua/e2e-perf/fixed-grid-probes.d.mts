export function prepareReverseGridScroll(element: Pick<Element, "clientWidth" | "scrollTop">, options: {
  threshold: number;
  rowHeight: number;
  minCellWidth: number;
  bufferOffset: number;
}): { columns: number };

export function installReverseGridDirectionProbe(options: { columns: number; rowHeight: number }): void;

export interface FocusedViewportPosition {
  viewportY: number;
  viewportRatio: number;
  visible: boolean;
  view: "grid" | "table";
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
  localIdx: number;
  bufferOffset: number;
  resultsLength: number;
}

export function readFocusedViewportPosition(options: {
  GRID_ROW: number;
  GRID_COLS: number;
  TABLE_ROW: number;
}): FocusedViewportPosition | null;