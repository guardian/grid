import type { Image } from "@/types/image";
import type { ImageLayout } from "./justified-layout";
import type { LayoutWindow } from "./windowed-justified-layout";
import type { LayoutRow, SpatialNavigation, WindowGeometry } from "./scroll-geometry-ref";
import { prepareDestinationSeek } from "./destination-seek";
import { getFixedRowCount, getItemColumn, getItemLayoutRow, getLayoutRow } from "./scroll-geometry-ref";

export const UPLOAD_SECTION_LABELS = { batch: "Your current batch", other: "My other uploads" } as const;
export const UPLOAD_SECTION_HEIGHT = 72;
export function getUploadStickyInset(scrollTop: number, intro: number, chrome: NonNullable<LayoutWindow["uploadChrome"]>, otherTop?: number): number {
  return (scrollTop >= intro ? chrome.batch : 0)
    + (otherTop !== undefined && scrollTop >= otherTop - chrome.batch ? chrome.other ?? UPLOAD_SECTION_HEIGHT : 0);
}

type SourceLayout = ImageLayout & { window?: WindowGeometry; spatial?: SpatialNavigation; isEstimatedSpan?: (index: number) => boolean; measurements?: ReadonlyMap<string, number> };
export type SectionLayout = SourceLayout & { window: WindowGeometry; spatial: SpatialNavigation;
  isEstimatedSpan: (index: number) => boolean; measurements: ReadonlyMap<string, number>;
  headers: Array<{ section: "batch" | "other"; top: number }>; sourceLayouts: SourceLayout[] };

export function composeUploadLayout(images: readonly (Image | undefined)[], width: number, context: LayoutWindow,
  boundary: number, batchPresent: boolean, factory: (images: readonly (Image | undefined)[], context: LayoutWindow, previous?: SourceLayout) => SourceLayout,
  previous?: SectionLayout): SectionLayout {
  const windowStart = context.bufferOffset;
  const windowEnd = windowStart + images.length;
  let height = (context.indexed || windowStart === 0 ? context.uploadChrome?.intro ?? 0 : 0)
    + (context.uploadChrome?.batch ?? 0);
  let rowCount = 0;
  let spatialCount = 0;
  let unassignedHeaders = height;
  const headers: SectionLayout["headers"] = [];
  const sources = ([{ section: "batch" as const, start: 0, end: boundary, present: batchPresent },
    { section: "other" as const, start: boundary, end: context.total, present: true }]).map((part, sectionIndex) => {
    const first = Math.max(part.start, Math.min(part.end, windowStart));
    const end = Math.max(first, Math.min(part.end, windowEnd));
    const slice = images.slice(Math.max(0, first - windowStart), Math.max(0, end - windowStart));
    const showHeader = part.section === "other" && part.present && (context.indexed || part.start <= windowEnd);
    if (showHeader) {
      headers.push({ section: part.section, top: height });
      const headerHeight = context.uploadChrome?.other ?? UPLOAD_SECTION_HEIGHT;
      height += headerHeight;
      unassignedHeaders += headerHeight;
    }
    const layout = factory(slice, { ...context, bufferOffset: first - part.start, total: part.end - part.start,
      uploadSection: part.section, searchKey: `${context.searchKey}:${part.section}` }, previous?.sourceLayouts[sectionIndex]);
    const result = { ...part, layout, top: height, firstRow: rowCount,
      firstSpatialRow: spatialCount, itemOffset: context.indexed ? part.start : first - windowStart, headers: layout.rowCount ? unassignedHeaders : 0 };
    if (layout.rowCount) unassignedHeaders = 0;
    height += layout.height;
    rowCount += layout.rowCount;
    spatialCount += layout.spatial ? context.indexed ? part.end - part.start : slice.length : layout.rowCount;
    return result;
  });
  const sourceForItem = (index: number) => sources[(index + (context.indexed ? 0 : windowStart)) < boundary ? 0 : 1];
  const sourceForRow = (index: number) => sources[1].layout.rowCount && index >= sources[1].firstRow ? sources[1] : sources[0];
  const translate = (source: typeof sources[number], row: LayoutRow): LayoutRow => ({ ...row,
    index: row.index + source.firstRow, top: row.top + source.top,
    firstItemIndex: row.firstItemIndex + source.itemOffset, lastItemIndex: row.lastItemIndex + source.itemOffset });
  const getRow = (index: number) => {
    const source = sourceForRow(index);
    const row = translate(source, source.layout.getRow(index - source.firstRow));
    return { ...row, height: row.height + (index === source.firstRow ? source.headers : 0) };
  };
  const getItemRow = (index: number) => {
    const source = sourceForItem(index);
    return translate(source, source.layout.getItemRow(index - source.itemOffset));
  };
  const rowAtOffset = (offset: number): LayoutRow | undefined => {
    const source = sources[1].layout.rowCount && offset >= sources[1].top - sources[1].headers ? sources[1] : sources[0].layout.rowCount ? sources[0] : sources[1];
    const row = source.layout.rowAtOffset(Math.max(0, offset - source.top));
    return row && translate(source, row);
  };
  const neighbour = (index: number, target: number) => {
    const source = sourceForItem(index);
    if (sourceForRow(target) === source) return source.layout.neighbour(index - source.itemOffset, target - source.firstRow) + source.itemOffset;
    const row = getRow(Math.max(0, Math.min(rowCount - 1, target)));
    return row.firstItemIndex;
  };
  const spatialRow = (source: typeof sources[number], row: LayoutRow) => ({ ...translate(source, row), index: row.index + source.firstSpatialRow });
  const spatialSource = (index: number) => index >= sources[1].firstSpatialRow && sources[1].layout.rowCount ? sources[1] : sources[0];
  const spatial: SpatialNavigation = {
    getRow: index => { const source = spatialSource(index); return spatialRow(source, (source.layout.spatial ?? source.layout).getRow(index - source.firstSpatialRow)); },
    getItemRow: index => { const source = sourceForItem(index); return spatialRow(source, (source.layout.spatial ?? source.layout).getItemRow(index - source.itemOffset)); },
    rowAtOffset: offset => {
      const row = rowAtOffset(offset);
      if (!row) return undefined;
      const source = sourceForItem(row.firstItemIndex);
      const local = (source.layout.spatial ?? source.layout).rowAtOffset(Math.max(0, offset - source.top));
      return local && spatialRow(source, local);
    },
    neighbour: (index, target) => {
      target = Math.max(0, Math.min(spatialCount - 1, target));
      const source = sourceForItem(index);
      if (spatialSource(target) !== source) return spatial.getRow(target).firstItemIndex;
      return (source.layout.spatial ?? source.layout).neighbour(index - source.itemOffset, target - source.firstSpatialRow) + source.itemOffset;
    },
  };
  const ids = new Map(images.flatMap((image, index) => image ? [[image.id, index + (context.indexed ? windowStart : 0)] as const] : []));
  return { rowCount, height, headers, sourceLayouts: sources.map(source => source.layout), getRow, getItemRow, rowAtOffset, neighbour,
    measurements: new Map(sources.flatMap(source => [...source.layout.measurements ?? []])),
    isEstimatedSpan: index => { const source = sourceForRow(index); return source.layout.isEstimatedSpan?.(index - source.firstRow) ?? false; },
    getBox: index => {
      const source = sourceForItem(index);
      const box = source.layout.getBox(index - source.itemOffset);
      return box && { ...box, top: box.top + source.top };
    },
    spatial,
    window: { width, getItemId: index => images[index - (context.indexed ? windowStart : 0)]?.id, findItemIndex: id => ids.get(id), rowAtOffset,
      visibleRows: (top, viewportHeight) => ({ first: rowAtOffset(top), last: rowAtOffset(top + viewportHeight) }),
      prepareSeek: input => {
        const destination = composeUploadLayout(input.images, width, { ...context, indexed: false, bufferOffset: input.bufferOffset, total: input.total }, boundary, batchPresent, factory);
        const row = destination.rowAtOffset(input.scrollTop);
        if (!row) return { scrollTargetIndex: 0, seekSubRowOffset: 0 };
        const prepared = prepareDestinationSeek({ reverseIndex: row.firstItemIndex, subRowOffset: Math.max(0, input.scrollTop - row.top),
          backwardItemCount: input.backwardItemCount, bufferLength: input.images.length, actualOffset: input.bufferOffset, total: input.total, clampedOffset: input.clampedOffset });
        const index = Math.max(0, Math.min(input.images.length - 1, prepared.endTargetIndex ?? prepared.reverseIndex));
        return { scrollTargetIndex: index, seekSubRowOffset: prepared.seekSubRowOffset };
      } },
  };
}

export function fixedUploadLayout(count: number, width: number, columns: number, rowHeight: number, itemOffset = 0): SourceLayout {
  const geometry = { columns, rowHeight, itemOffset, itemCount: count };
  const rowCount = getFixedRowCount(geometry, count);
  const getRow = (index: number): LayoutRow => getLayoutRow(geometry, index);
  const getItemRow = (index: number) => getItemLayoutRow(geometry, index);
  return { rowCount, height: rowCount * rowHeight, getRow, getItemRow,
    getBox: index => ({ top: getItemRow(index).top, left: 4 + getItemColumn(geometry, index) * width / columns, width: width / columns - 4, height: rowHeight - 4, aspectRatio: 1 }),
    rowAtOffset: offset => count ? getRow(Math.max(0, Math.min(rowCount - 1, Math.floor(offset / rowHeight)))) : undefined,
    neighbour: (index, row) => Math.max(0, Math.min(count - 1, index + (row - getItemRow(index).index) * columns)) };
}