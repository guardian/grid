import type { Image } from "@/types/image";
import type { ImageLayout } from "./justified-layout";
import type { LayoutWindow } from "./windowed-justified-layout";
import type { LayoutRow, SpatialNavigation, WindowGeometry } from "./scroll-geometry-ref";
import { prepareDestinationSeek } from "./destination-seek";

export interface MeasuredLayoutOptions {
  estimatedHeight: number;
  estimate: (image: Image | undefined) => number;
  anchorHeight?: (image: Image) => number;
  measurements: ReadonlyMap<string, number>;
}

export interface MeasuredLayout extends ImageLayout {
  window: WindowGeometry;
  spatial: SpatialNavigation;
  measurements: ReadonlyMap<string, number>;
  isEstimatedSpan: (rowIndex: number) => boolean;
}

export function buildMeasuredLayout(
  images: readonly (Image | undefined)[], width: number, context: LayoutWindow,
  options: MeasuredLayoutOptions,
): MeasuredLayout {
  const start = context.indexed ? context.bufferOffset : 0;
  const count = context.indexed ? context.total : images.length;
  const end = start + images.length;
  const rows: LayoutRow[] = [];
  const ids = new Map<string, number>();
  const measurements = new Map<string, number>();
  let height = 0;
  const append = (first: number, last: number, size: number) => {
    rows.push({ index: rows.length, top: height, height: size, firstItemIndex: first, lastItemIndex: last });
    height += size;
  };
  if (start > 0) append(0, start - 1, start * options.estimatedHeight);
  const firstLoadedRow = rows.length;
  images.forEach((image, index) => {
    const measured = image && options.measurements.get(image.id);
    if (image) {
      ids.set(image.id, start + index);
      if (measured !== undefined) measurements.set(image.id, measured);
    }
    append(start + index, start + index, measured ?? options.estimate(image));
    if (image && options.anchorHeight) rows[rows.length - 1].anchorHeight = options.anchorHeight(image);
  });
  if (end < count) append(end, count - 1, (count - end) * options.estimatedHeight);
  const getRow = (index: number) => {
    const row = rows[index];
    if (!row) throw new Error("Measured row outside window");
    return row;
  };
  const getItemRow = (index: number): LayoutRow => {
    if (index < 0 || index >= count) throw new Error("Measured item outside extent");
    if (index >= start && index < end) return getRow(firstLoadedRow + index - start);
    const span = index < start ? getRow(0) : getRow(rows.length - 1);
    return { ...span, top: span.top + (index - span.firstItemIndex) * options.estimatedHeight,
      height: options.estimatedHeight, firstItemIndex: index, lastItemIndex: index };
  };
  const rowAtOffset = (offset: number): LayoutRow | undefined => {
    if (!rows.length) return undefined;
    let low = 0;
    let high = rows.length - 1;
    while (low < high) {
      const middle = Math.ceil((low + high) / 2);
      if (rows[middle].top <= offset) low = middle;
      else high = middle - 1;
    }
    const row = rows[low];
    if (row.firstItemIndex === row.lastItemIndex) return row;
    const index = Math.max(row.firstItemIndex, Math.min(row.lastItemIndex,
      row.firstItemIndex + Math.floor((offset - row.top) / options.estimatedHeight)));
    return getItemRow(index);
  };
  return {
    rowCount: rows.length, height, measurements, getRow, getItemRow, rowAtOffset,
    spatial: {
      getRow: index => ({ ...getItemRow(index), index }),
      getItemRow: index => ({ ...getItemRow(index), index }),
      rowAtOffset: offset => {
        const row = rowAtOffset(offset);
        return row && { ...row, index: row.firstItemIndex };
      },
      neighbour: (_index, target) => Math.max(0, Math.min(count - 1, target)),
    },
    isEstimatedSpan: index => index < firstLoadedRow || index >= firstLoadedRow + images.length,
    getBox: index => {
      if (index < 0 || index >= count) return undefined;
      const row = getItemRow(index);
      return { top: row.top, left: 0, width, height: row.height, aspectRatio: width / row.height };
    },
    neighbour: (index, rowIndex) => {
      const target = getRow(Math.max(0, Math.min(rows.length - 1, rowIndex)));
      return Math.max(target.firstItemIndex, Math.min(target.lastItemIndex,
        index + Math.sign(rowIndex - getItemRow(index).index)));
    },
    window: {
      width, getItemId: index => images[index - start]?.id, findItemIndex: id => ids.get(id), rowAtOffset,
      visibleRows: (top, viewportHeight) => ({ first: rowAtOffset(top), last: rowAtOffset(top + viewportHeight) }),
      prepareSeek: input => {
        const destination = buildMeasuredLayout(input.images, width,
          { ...context, indexed: false, bufferOffset: input.bufferOffset, total: input.total }, options);
        const row = destination.rowAtOffset(input.scrollTop);
        if (!row) return { scrollTargetIndex: 0, seekSubRowOffset: 0 };
        const prepared = prepareDestinationSeek({ reverseIndex: row.firstItemIndex,
          subRowOffset: Math.max(0, input.scrollTop - row.top), backwardItemCount: input.backwardItemCount,
          bufferLength: input.images.length, actualOffset: input.bufferOffset,
          total: input.total, clampedOffset: input.clampedOffset });
        let index = Math.min(input.images.length - 1, prepared.endTargetIndex ?? prepared.reverseIndex);
        if (!prepared.atRealEnd && destination.getItemRow(index).top >= destination.height - input.clientHeight) {
          index = destination.rowAtOffset(Math.max(0, destination.height - input.clientHeight))!.firstItemIndex;
        }
        return { scrollTargetIndex: index, seekSubRowOffset: prepared.seekSubRowOffset };
      },
    },
  };
}