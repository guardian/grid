import type { Image } from "@/types/image";
import type { LayoutRow, WindowGeometry, WindowSeekInput } from "@/lib/scroll-geometry-ref";
import { buildRatioLayout, imageRatio, type ImageLayout, type JustifiedLayout } from "@/lib/justified-layout";

export const JUSTIFIED_BLOCK_SIZE = 48;

export interface LayoutWindow {
  bufferOffset: number;
  total: number;
  indexed: boolean;
  searchKey: string;
}

interface Dimension { id: string; ratio: number }
interface Block {
  start: number;
  firstRow: number;
  top: number;
  packed: JustifiedLayout;
  fromRow: number;
  rowCount: number;
  cropTop: number;
}

export interface JustifiedWindowSnapshot {
  origin: number;
  searchKey: string;
  indexed: boolean;
  dimensions: ReadonlyMap<number, Dimension>;
}

export interface WindowedJustifiedLayout extends ImageLayout, JustifiedWindowSnapshot {
  window: WindowGeometry;
}

/** Only current-buffer dimensions and the two intersecting boundary blocks survive. */
export function buildWindowedJustifiedLayout(
  images: readonly (Image | undefined)[], width: number, context: LayoutWindow,
  previous?: JustifiedWindowSnapshot,
): WindowedJustifiedLayout {
  const size = JUSTIFIED_BLOCK_SIZE;
  const compatible = previous?.searchKey === context.searchKey && previous.indexed === context.indexed;
  let origin = context.indexed ? context.bufferOffset : 0;
  let overlap = false;
  if (compatible && previous) {
    const ordinals = new Map([...previous.dimensions].map(([ordinal, value]) => [value.id, ordinal]));
    for (let index = 0; index < images.length; index++) {
      const ordinal = images[index] && ordinals.get(images[index]!.id);
      if (ordinal === undefined) continue;
      const candidate = ordinal - index;
      if (!overlap && !context.indexed) origin = candidate;
      if (candidate !== origin) { overlap = false; origin = context.indexed ? context.bufferOffset : 0; break; }
      overlap = true;
    }
  }
  const firstBlock = Math.floor(origin / size) * size;
  const lastBlock = Math.floor((origin + Math.max(0, images.length - 1)) / size) * size;
  const dimensions = new Map<number, Dimension>();
  if (overlap && previous) {
    for (const [ordinal, value] of previous.dimensions) {
      if (ordinal >= firstBlock && ordinal < lastBlock + size) dimensions.set(ordinal, value);
    }
  }
  images.forEach((image, index) => {
    if (image) dimensions.set(origin + index, { id: image.id, ratio: imageRatio(image) });
  });
  const ids = new Map<string, number>();
  const itemIds = new Map<number, string>();
  images.forEach((image, index) => {
    if (!image) return;
    const itemIndex = context.indexed ? context.bufferOffset + index : index;
    ids.set(image.id, itemIndex);
    itemIds.set(itemIndex, image.id);
  });
  const blocks: Block[] = [];
  const begin = context.indexed ? 0 : firstBlock;
  const end = context.indexed ? context.total : origin + images.length;
  const estimated = buildRatioLayout(Array(size).fill(1), width, true);
  let rowCount = 0;
  let height = 0;
  for (let blockStart = begin; blockStart < end; blockStart += size) {
    const start = !context.indexed && context.bufferOffset === 0 ? Math.max(blockStart, origin) : blockStart;
    const blockEnd = context.indexed || context.bufferOffset + images.length >= context.total
      ? Math.min(blockStart + size, end) : blockStart + size;
    const count = blockEnd - start;
    const known = blockStart >= firstBlock && blockStart <= lastBlock;
    const trueEnd = blockEnd === end && (context.indexed || context.bufferOffset + images.length >= context.total);
    const packed = !known && count === size && !trueEnd ? estimated
      : buildRatioLayout(Array.from({ length: count }, (_, index) => dimensions.get(start + index)?.ratio ?? 1), width, !trueEnd);
    const first = context.indexed ? 0 : Math.max(0, origin - start);
    const last = context.indexed ? count - 1 : Math.min(count - 1, end - start - 1);
    const fromRow = packed.getItemRow(first).index;
    const toRow = packed.getItemRow(last).index;
    const cropTop = packed.getRow(fromRow).top;
    const blockHeight = packed.getRow(toRow).top + packed.getRow(toRow).height - cropTop;
    blocks.push({ start, firstRow: rowCount, top: height, packed, fromRow, rowCount: toRow - fromRow + 1, cropTop });
    rowCount += toRow - fromRow + 1;
    height += blockHeight + 4;
  }
  height = Math.max(0, height - 4);
  const itemCount = context.indexed ? context.total : images.length;
  const toItem = (ordinal: number) => context.indexed ? ordinal : ordinal - origin;
  const findBlock = (value: number, field: "firstRow" | "top") => {
    let low = 0;
    let high = blocks.length - 1;
    while (low < high) {
      const mid = Math.ceil((low + high) / 2);
      if (blocks[mid][field] <= value) low = mid;
      else high = mid - 1;
    }
    return blocks[low];
  };
  const rowFrom = (block: Block, row: LayoutRow): LayoutRow => ({
    index: block.firstRow + row.index - block.fromRow,
    top: block.top + row.top - block.cropTop,
    height: row.height + (row.index === block.fromRow + block.rowCount - 1 && block !== blocks.at(-1) ? 4 : 0),
    firstItemIndex: Math.max(0, toItem(block.start + row.firstItemIndex)),
    lastItemIndex: Math.min(itemCount - 1, toItem(block.start + row.lastItemIndex)),
  });
  const itemBlock = (index: number) => {
    const ordinal = context.indexed ? index : index + origin;
    return { ordinal, block: blocks[Math.floor((ordinal - begin) / size)] };
  };
  const getRow = (index: number) => {
    const block = findBlock(index, "firstRow");
    if (!block || index < 0 || index >= rowCount) throw new Error("Justified row outside window");
    return rowFrom(block, block.packed.getRow(index - block.firstRow + block.fromRow));
  };
  const getItemRow = (index: number) => {
    const { block, ordinal } = itemBlock(index);
    if (!block || index < 0 || index >= itemCount) throw new Error("Justified image outside window");
    return rowFrom(block, block.packed.getItemRow(ordinal - block.start));
  };
  const getBox = (index: number) => {
    const { block, ordinal } = itemBlock(index);
    const box = block?.packed.getBox(ordinal - block.start);
    return box && { ...box, top: block.top + box.top - block.cropTop };
  };
  const rowAtOffset = (offset: number) => {
    if (!rowCount) return undefined;
    const block = findBlock(offset, "top");
    const row = block.packed.rowAtOffset(offset - block.top + block.cropTop)!;
    return getRow(Math.max(block.firstRow, Math.min(block.firstRow + block.rowCount - 1,
      block.firstRow + row.index - block.fromRow)));
  };
  const layout: WindowedJustifiedLayout = {
    origin, searchKey: context.searchKey, indexed: context.indexed, dimensions,
    rowCount, height, getRow, getItemRow, getBox, rowAtOffset,
    neighbour(index, targetRow) {
      const box = getBox(index);
      if (!box || !rowCount) return index;
      const row = getRow(Math.max(0, Math.min(rowCount - 1, targetRow)));
      let best = row.firstItemIndex;
      let distance = Infinity;
      for (let candidate = row.firstItemIndex; candidate <= row.lastItemIndex; candidate++) {
        const next = getBox(candidate)!;
        const d = Math.abs(next.left + next.width / 2 - box.left - box.width / 2);
        if (d < distance) { best = candidate; distance = d; }
      }
      return best;
    },
    window: {
      width, getItemId: index => itemIds.get(index),
      findItemIndex: id => ids.get(id), rowAtOffset,
      prepareSeek(input: WindowSeekInput) {
        const next = buildWindowedJustifiedLayout(input.images, width,
          { ...context, indexed: false, total: input.total, bufferOffset: input.bufferOffset },
          context.indexed ? undefined : layout);
        const row = next.rowAtOffset(input.scrollTop);
        if (!row) return { scrollTargetIndex: 0, seekSubRowOffset: 0 };
        let index = row.firstItemIndex;
        let seekSubRowOffset = 0;
        if (input.backwardItemCount > 0 && index < input.backwardItemCount) {
          index += input.backwardItemCount;
          seekSubRowOffset = Math.max(0, input.scrollTop - row.top);
        }
        if (input.bufferOffset + input.images.length >= input.total) {
          if (input.clampedOffset >= input.total - input.images.length) index = input.images.length - 1;
        } else if (index >= input.images.length || next.getItemRow(index).top >= next.height - input.clientHeight) {
          index = next.rowAtOffset(Math.max(0, next.height - input.clientHeight))!.firstItemIndex;
        }
        return { scrollTargetIndex: Math.max(0, Math.min(input.images.length - 1, index)), seekSubRowOffset };
      },
    },
  };
  return layout;
}
