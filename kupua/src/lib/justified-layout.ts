import { JustifiedLayout as ImmichLayout } from "@immich/justified-layout-wasm";
import type { Image } from "@/types/image";
import type { LayoutRow } from "@/lib/scroll-geometry-ref";

export interface ImageBox { top: number; left: number; width: number; height: number; aspectRatio: number }

export interface ImageLayout {
  rowCount: number;
  getBox: (index: number) => ImageBox | undefined;
  height: number;
  getRow: (index: number) => LayoutRow;
  getItemRow: (index: number) => LayoutRow;
  rowAtOffset: (offset: number) => LayoutRow | undefined;
  neighbour: (itemIndex: number, rowIndex: number) => number;
}

export interface JustifiedLayout extends ImageLayout {
  boxes: ImageBox[];
  rows: LayoutRow[];
}

export function imageRatio(image: Image): number {
  const dimensions = image.source?.orientedDimensions ?? image.source?.dimensions;
  const { width, height } = dimensions ?? {};
  return typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height)
    && width > 0 && height > 0 ? width / height : 1;
}

export function buildJustifiedLayout(images: readonly Image[], width: number): JustifiedLayout {
  return buildRatioLayout(images.map(imageRatio), width);
}

function balanceBlockEnd(boxes: ImageBox[], width: number, targetHeight: number): number | undefined {
  const last = boxes.at(-1);
  if (!last || width - last.left - last.width < 0.001) return;
  const rowStarts = boxes.flatMap((box, index) => index === 0 || box.top !== boxes[index - 1].top ? [index] : []);
  for (const start of rowStarts.slice(-3)) {
    const count = boxes.length - start;
    const costs = Array<number>(count + 1).fill(Infinity);
    const previous = Array<number>(count + 1).fill(-1);
    const heights = Array<number>(count + 1).fill(0);
    costs[0] = 0;
    for (let end = 1; end <= count; end++) {
      let sum = 0;
      for (let begin = end - 1; begin >= 0; begin--) {
        sum += boxes[start + begin].aspectRatio;
        const height = (width - 4 * (end - begin - 1)) / sum;
        if (height < targetHeight * 0.5 || height > targetHeight * 1.5) continue;
        const cost = costs[begin] + (end - begin) * ((height - targetHeight) / targetHeight) ** 2;
        if (cost >= costs[end]) continue;
        costs[end] = cost;
        previous[end] = begin;
        heights[end] = height;
      }
    }
    // An extreme earlier row must not prevent repairing a feasible shorter tail.
    if (previous[count] === -1) continue;
    const ends: number[] = [];
    for (let end = count; end > 0; end = previous[end]) ends.push(end);
    let top = boxes[start].top;
    for (const end of ends.reverse()) {
      const height = heights[end];
      let left = 0;
      for (let index = previous[end]; index < end; index++) {
        const box = boxes[start + index];
        box.top = top;
        box.left = left;
        box.height = height;
        box.width = height * box.aspectRatio;
        left += box.width + 4;
      }
      top += height + 4;
    }
    return top - 4;
  }
}

export function buildRatioLayout(ratios: number[], width: number, balanceTrailingRows = false): JustifiedLayout {
  const rowWidth = Math.max(1, width);
  const rowHeight = width < 600 ? 130 : 190;
  const packed = new ImmichLayout(new Float32Array(ratios), {
    rowWidth, spacing: 4, rowHeight, heightTolerance: 0.5,
  });
  const boxes = ratios.map((aspectRatio, index) => ({ ...packed.getPosition(index), aspectRatio }));
  const height = (balanceTrailingRows ? balanceBlockEnd(boxes, rowWidth, rowHeight) : undefined) ?? packed.containerHeight;
  const rows: LayoutRow[] = [];
  const itemRows: LayoutRow[] = [];
  for (const [index, box] of boxes.entries()) {
    let row = rows.at(-1);
    if (!row || row.top !== box.top) {
      row = { index: rows.length, top: box.top, height: box.height,
        firstItemIndex: index, lastItemIndex: index };
      rows.push(row);
    }
    row.lastItemIndex = index;
    itemRows.push(row);
  }
  for (let index = 0; index < rows.length; index++) {
    rows[index].height = (rows[index + 1]?.top ?? height) - rows[index].top;
  }
  const requireRow = (row: LayoutRow | undefined) => {
    if (!row) throw new Error("Justified geometry is not ready for this image");
    return row;
  };
  const rowAtOffset = (offset: number) => {
    if (rows.length === 0) return undefined;
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (rows[middle].top <= offset) low = middle;
      else high = middle - 1;
    }
    return rows[low];
  };
  return {
    boxes, rows, rowCount: rows.length, getBox: index => boxes[index], height,
    getRow: index => requireRow(rows[index]),
    getItemRow: index => requireRow(itemRows[index]),
    rowAtOffset,
    neighbour: (itemIndex, rowIndex) => {
      const box = boxes[itemIndex];
      const row = rows[Math.max(0, Math.min(rows.length - 1, rowIndex))];
      if (!box || !row) return itemIndex;
      const centre = box.left + box.width / 2;
      let best = row.firstItemIndex;
      let distance = Infinity;
      for (let index = row.firstItemIndex; index <= row.lastItemIndex; index++) {
        const candidate = boxes[index];
        const nextDistance = Math.abs(candidate.left + candidate.width / 2 - centre);
        if (nextDistance < distance) { best = index; distance = nextDistance; }
      }
      return best;
    },
  };
}
