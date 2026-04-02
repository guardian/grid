import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
} from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  createColumnHelper,
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSizingState,
  type Row,
} from "@tanstack/react-table";
import { useVirtualizer, type VirtualItem } from "@tanstack/react-virtual";
import { useDataWindow } from "@/hooks/useDataWindow";
import { useHeaderHeight } from "@/hooks/useHeaderHeight";
import { useListNavigation } from "@/hooks/useListNavigation";
import { useReturnFromDetail } from "@/hooks/useReturnFromDetail";
import { useScrollEffects } from "@/hooks/useScrollEffects";
import { useColumnStore } from "@/stores/column-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { ColumnContextMenu, type ColumnContextMenuHandle } from "./ColumnContextMenu";
import type { Image } from "@/types/image";
import { upsertFieldTerm } from "@/lib/cql-query-edit";
import { cancelSearchDebounce } from "./SearchBar";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { storeImageOffset, buildSearchKey, extractSortValues } from "@/lib/image-offset-cache";
import { DataSearchPill } from "./SearchPill";
import {
  FIELD_REGISTRY,
  FIELDS_BY_ID,
  COLUMN_CQL_KEYS,
  SORTABLE_FIELDS as REGISTRY_SORTABLE_FIELDS,
  DESC_BY_DEFAULT,
  getFieldRawValue,
  type FieldDefinition,
} from "@/lib/field-registry";
import {
  TABLE_ROW_HEIGHT as ROW_HEIGHT,
  TABLE_HEADER_HEIGHT as HEADER_HEIGHT,
} from "@/constants/layout";

const columnHelper = createColumnHelper<Image>();

// ---------------------------------------------------------------------------
// Build TanStack column defs from the field registry
// ---------------------------------------------------------------------------

/**
 * Build a cell renderer for a list field (subjects, people).
 * Each item is a pill — individually clickable for search via
 * data-cql-key/data-cql-value (delegated click handling in the table).
 */
function listCellRenderer(field: FieldDefinition) {
  return (image: Image) => {
    const values = field.accessor(image);
    if (!Array.isArray(values) || values.length === 0) return "—";
    return (
      <span className="inline-flex flex-nowrap gap-0.5 overflow-hidden" style={{ contain: "layout" }}>
        {values.map((v, i) => (
          <DataSearchPill key={i} cqlKey={field.cqlKey!} value={v} />
        ))}
      </span>
    );
  };
}

/**
 * Build a cell renderer for a composite field (location).
 * Each sub-field gets its own data-cql-key for click-to-search.
 */
function compositeCellRenderer(field: FieldDefinition) {
  return (image: Image) => {
    const parts = (field.subFields ?? [])
      .map((sf) => ({ cqlKey: sf.cqlKey, value: sf.accessor(image) }))
      .filter((p): p is { cqlKey: string; value: string } => p.value != null);
    if (parts.length === 0) return "—";
    return (
      <>
        {parts.map((p, i) => (
          <span key={p.cqlKey}>
            {i > 0 && <span className="text-grid-text-dim">, </span>}
            <span
              data-cql-key={p.cqlKey}
              data-cql-value={p.value}
              className="hover:underline hover:text-grid-accent cursor-pointer"
            >
              {p.value}
            </span>
          </span>
        ))}
      </>
    );
  };
}

/**
 * Generate a TanStack column def from a FieldDefinition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function fieldToColumnDef(field: FieldDefinition): ColumnDef<Image, any> {
  // Pick the cell renderer
  const renderer = field.cellRenderer
    ?? (field.isList ? listCellRenderer(field) : undefined)
    ?? (field.isComposite ? compositeCellRenderer(field) : undefined);

  return columnHelper.accessor(
    (row) => {
      const val = field.accessor(row);
      if (Array.isArray(val)) return val.join(", ");
      return val;
    },
    {
      id: field.id,
      header: field.label,
      size: field.defaultWidth,
      cell: renderer
        ? (info) => renderer(info.row.original)
        : field.formatter
          ? (info) => {
              const raw = info.getValue();
              return raw ? field.formatter!(raw) : "—";
            }
          : (info) => info.getValue() || "—",
    }
  );
}

/** All data columns generated from the field registry. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registryColumnDefs: ColumnDef<Image, any>[] = FIELD_REGISTRY.map(fieldToColumnDef);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const allColumns: ColumnDef<Image, any>[] = [
  // Thumbnail column — only included when S3 proxy is running (TEST mode)
  ...(thumbnailsEnabled
    ? [
        columnHelper.display({
          id: "thumbnail",
          header: "Pic",
          size: 48,
          enableResizing: false,
          cell: (info) => {
            const url = getThumbnailUrl(info.row.original);
            if (!url) return null;
            return (
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-7 w-auto object-contain"
                onError={(e) => {
                  // Hide broken images silently
                  (e.target as HTMLImageElement).style.display = "none";
                }}
              />
            );
          },
        }),
      ]
    : []),
  ...registryColumnDefs,
];


/**
 * Fields whose natural first-sort direction is descending (newest first).
 * All other sortable fields default to ascending (A→Z for text, 0→∞ for numbers).
 * Derived from the field registry.
 */

/** Return the default orderBy token for a field's first sort click. */
function defaultSortFor(field: string): string {
  return DESC_BY_DEFAULT.has(field) ? `-${field}` : field;
}

/**
 * Resolve the column ID that TanStack Table will generate.
 * Dot-path accessors get dots replaced with underscores;
 * columns with an explicit `id` keep it as-is.
 */
function getColumnId(col: ColumnDef<Image, unknown>): string {
  if ("id" in col && col.id) return col.id;
  if ("accessorKey" in col && typeof col.accessorKey === "string") {
    return col.accessorKey.replace(/\./g, "_");
  }
  return "";
}

// ---------------------------------------------------------------------------
// (C) CSS-variable column widths
//
// Instead of every header cell and body cell calling header.getSize() /
// cell.column.getSize() (which walks TanStack's state tree ~300+ times per
// render), we compute the sizes once and inject them as CSS custom properties
// on a <style> tag.  Header and body cells reference
//   width: var(--col-<columnId>)
// This means width changes (from resize drag) only touch the <style> tag's
// textContent — the body cells pick up the new widths through CSS without
// React re-rendering them.
// ---------------------------------------------------------------------------

/** Build a CSS string setting `--col-<id>` for every column. */
function buildColumnSizeVars(
  colIds: string[],
  colSizing: ColumnSizingState,
  defaultSizes: Record<string, number>
): string {
  return colIds
    .map((id) => {
      const w = colSizing[id] ?? defaultSizes[id] ?? 150;
      return `--col-${id}:${w}px`;
    })
    .join(";");
}

// ---------------------------------------------------------------------------
// (D) Memoised table body — zero re-renders while dragging
//
// During a column resize drag, TanStack Table updates columnSizingInfo on
// every mousemove, which would re-render the entire component tree.  By
// extracting the virtualised body into a React.memo component, we skip
// body re-renders entirely during drag — the body cells get their new
// widths from the CSS variables above (pure CSS, no React involvement).
//
// The official TanStack "performant" column-resizing example shows this
// pattern but has a bug (#6121) where the memo condition uses the wrong
// comparison.  We avoid it by simply memoising on the props that matter
// to the body: rows and virtualItems.
// ---------------------------------------------------------------------------

interface TableBodyProps {
  virtualItems: VirtualItem[];
  rows: Row<Image>[];
  handleCellClick: (columnId: string, image: Image, e: React.MouseEvent) => void;
  handleRowDoubleClick: (imageId: string) => void;
  handleRowClick: (imageId: string) => void;
  focusedImageId: string | null;
  /** Number of visible columns — used to bust memo when column visibility changes. */
  visibleColumnCount: number;
  /** Look up the image at a global index (may be undefined if not loaded). */
  getImage: (index: number) => Image | undefined;
}

const TableBody = memo(function TableBody({
  virtualItems,
  rows,
  handleCellClick,
  handleRowDoubleClick,
  handleRowClick,
  focusedImageId,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only used to bust memo
  visibleColumnCount: _,
  getImage,
}: TableBodyProps) {
  // Build a lookup map: imageId → TanStack Row for O(1) access.
  // TanStack Table only has loaded rows; we match by image ID rather
  // than by index (which would require offset translation).
  const rowsById = useMemo(() => {
    const map = new Map<string, Row<Image>>();
    for (const row of rows) {
      if (row.original?.id) {
        map.set(row.original.id, row);
      }
    }
    return map;
  }, [rows]);

  return (
    <>
      {virtualItems.map((virtualRow) => {
        const image = getImage(virtualRow.index);

        // Placeholder skeleton for unloaded rows
        if (!image) {
          return (
            <div
              key={`placeholder-${virtualRow.index}`}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="absolute left-0 right-0 flex items-center border-b border-grid-separator/30"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="bg-grid-separator/10 h-3 mx-4 rounded flex-1 max-w-xs" />
            </div>
          );
        }

        // Real row — find the matching TanStack Row for cell rendering
        const row = rowsById.get(image.id);
        if (!row) {
          // Image loaded but not yet in TanStack Table's row model
          // (can happen briefly during the render between store update
          // and Table re-render). Show a lightweight preview using the
          // image's description so the row doesn't flash as a skeleton.
          const preview =
            image.metadata.description ??
            image.metadata.title ??
            image.metadata.byline ??
            image.id;
          return (
            <div
              key={`pending-${virtualRow.index}`}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="absolute left-0 right-0 flex items-center border-b border-grid-separator/30 px-2 text-xs text-grid-text-dim truncate"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              {preview}
            </div>
          );
        }

        const isFocused = image.id === focusedImageId;
        return (
          <div
            key={row.id}
            role="row"
            aria-rowindex={virtualRow.index + 2} // +2: 1-based, header is row 1
            aria-selected={isFocused}
            className={`absolute left-0 right-0 flex border-b border-grid-separator/30 cursor-pointer select-none ${
              isFocused
                ? "bg-grid-hover/40 ring-2 ring-inset ring-grid-accent"
                : "hover:bg-grid-hover/15"
            }`}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
            onClick={() => handleRowClick(image.id)}
            onDoubleClick={() => handleRowDoubleClick(image.id)}
          >
            {row.getVisibleCells().map((cell) => {
              const rawValue = getFieldRawValue(
                cell.column.id,
                cell.row.original
              );
              const isClickable =
                cell.column.id in COLUMN_CQL_KEYS ||
                cell.column.id === "location" ||
                cell.column.id === "subjects" ||
                cell.column.id === "people";

              return (
                <div
                  key={cell.id}
                  role="gridcell"
                  className="flex items-center shrink-0 px-2 text-xs text-grid-text truncate border-r border-grid-separator/20 overflow-hidden"
                  style={{ width: `var(--col-${cell.column.id})`, contain: 'layout' }}
                  title={rawValue ?? undefined}
                  onMouseDown={
                    isClickable
                      ? (e) => {
                          if (e.shiftKey || e.altKey) e.preventDefault();
                        }
                      : undefined
                  }
                  onClick={
                    isClickable
                      ? (e) =>
                          handleCellClick(
                            cell.column.id,
                            cell.row.original,
                            e
                          )
                      : undefined
                  }
                >
                  {flexRender(
                    cell.column.columnDef.cell,
                    cell.getContext()
                  )}
                </div>
              );
            })}
          </div>
        );
      })}
    </>
  );
});

export function ImageTable() {
  const {
    results, total, bufferOffset, virtualizerCount, loading, loadMore, seek,
    focusedImageId, setFocusedImageId,
    reportVisibleRange, getImage, findImageIndex,
  } = useDataWindow();
  const {
    config,
    toggleVisibility,
    setWidths,
    setPreDoubleClickWidths,
    clearPreDoubleClickWidth,
  } = useColumnStore();
  const updateSearch = useUpdateSearchParams();
  const searchParams = useSearch({ from: "/search" });
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const parentRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  // C.1: Measure the actual rendered header height via ResizeObserver.
  // Falls back to TABLE_HEADER_HEIGHT (45) on the first frame before the DOM
  // is ready — same value as the constant, so no visible jump. Fires at most
  // once per session (mount) plus optionally on font load or resize.
  // Does NOT fire during scroll (ResizeObserver tracks border-box, not scrollTop).
  const [headerCallbackRef, headerHeight] = useHeaderHeight(HEADER_HEIGHT);

  // Single-click a row → set focus (sticky highlight).
  const handleRowClick = useCallback(
    (imageId: string) => {
      setFocusedImageId(imageId);
    },
    [setFocusedImageId],
  );

  // Double-click a row → show image detail overlay by adding image to URL.
  // Also sets focus so returning from image detail highlights this row.
  // Uses push (not replace) so browser back returns to the table at the
  // exact scroll position.
  const handleRowDoubleClick = useCallback(
    (imageId: string) => {
      setFocusedImageId(imageId);
      const idx = findImageIndex(imageId);
      if (idx >= 0) {
        const img = results[idx];
        const cursor = img ? extractSortValues(img, searchParamsRef.current.orderBy) : null;
        storeImageOffset(imageId, bufferOffset + idx, buildSearchKey(searchParamsRef.current), cursor);
      }
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId, findImageIndex, bufferOffset, results],
  );

  // Column context menu — imperative handle; the component manages its own
  // open/close state, viewport clamping, and dismiss behaviour.
  const columnMenuRef = useRef<ColumnContextMenuHandle>(null);

  // Filter columns by visibility from store
  const visibleColumns = useMemo(
    () =>
      allColumns.filter((col) => {
        const id = getColumnId(col);
        return !config.hidden.includes(id);
      }),
    [config.hidden]
  );

  // Build initial column sizing from store (persisted widths override defaults)
  const initialColumnSizing = useMemo(() => {
    const sizing: Record<string, number> = {};
    for (const col of allColumns) {
      const id = getColumnId(col);
      if (config.widths[id] !== undefined) {
        sizing[id] = config.widths[id];
      }
    }
    return sizing;
  }, []); // Only on mount — runtime changes go through table.setColumnSizing

  // ---------------------------------------------------------------------------
  // Virtualizer — created BEFORE the table so we can use the visible range
  // to determine which images to feed TanStack Table.
  // ---------------------------------------------------------------------------

  const virtualizer = useVirtualizer({
    count: virtualizerCount,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 5,
    // Account for sticky header — without this, scrollToIndex considers
    // rows behind the header as "visible" and won't scroll to them.
    // Subtract one ROW_HEIGHT because the padding is additive with the
    // virtualizer's own item-boundary snapping.
    // C.1: headerHeight is the ResizeObserver-measured value (falls back to
    // TABLE_HEADER_HEIGHT = 45 on first frame). Stays accurate if the header
    // ever changes size (e.g. font scale, added filter row).
    scrollPaddingStart: headerHeight - ROW_HEIGHT,
    // Buffer at the bottom so the focused row is never clipped by the
    // viewport edge at any zoom level.
    scrollPaddingEnd: ROW_HEIGHT * 2,
  });

  // -------------------------------------------------------------------------
  // Shared scroll effects (scroll container registration, scroll handler,
  // scroll compensation, seek, search-params reset, density/sort focus, etc.)
  // -------------------------------------------------------------------------

  useScrollEffects({
    virtualizer,
    parentRef,
    geometry: useMemo(
      () => ({
        rowHeight: ROW_HEIGHT,
        columns: 1,
        headerOffset: HEADER_HEIGHT,
        preserveScrollLeftOnSort: true,
      }),
      [],
    ),
    reportVisibleRange,
    resultsLength: results.length,
    total,
    bufferOffset,
    loadMore,
    focusedImageId,
    findImageIndex,
  });


  // TanStack Table only receives images visible in the current virtualizer
  // window. This keeps getCoreRowModel at O(~60 visible rows) instead of
  // O(all loaded images), preventing the 246ms → 2920ms → OOM stalls that
  // occurred when feeding all loaded data.
  //
  // The virtualizer's getVirtualItems() returns the indices currently rendered
  // (visible + overscan). We extract loaded images at those indices and feed
  // only those to TanStack Table. The render loop then looks up TanStack Rows
  // by image ID via a Map.
  const virtualItems = virtualizer.getVirtualItems();

  // Stable visible-image extraction: off-screen loadRange calls create a new
  // `results` array reference, but the images at the *visible* indices haven't
  // changed. We compare resolved image IDs before/after — if the set of visible
  // images is identical, we return the cached array. This prevents cascading
  // getCoreRowModel → TableBody reconciliation on every off-screen load.
  const prevVisibleImagesRef = useRef<Image[]>([]);
  const prevVisibleKeyRef = useRef<string>("");

  const visibleImages = useMemo(() => {
    const images: Image[] = [];
    const ids: string[] = [];
    for (const vItem of virtualItems) {
      const img = vItem.index < results.length ? results[vItem.index] : undefined;
      if (img) {
        images.push(img);
        ids.push(img.id);
      }
    }

    // A.5: O(1) sentinel instead of ids.join(","). The join is O(N) string
    // concatenation executed at up to 60fps during fast scroll (60 visible
    // rows × every render). First ID + last ID + count detects all meaningful
    // changes: window shift, resize, content change. The only theoretical
    // miss is swapping two *middle* IDs while keeping first/last/count the
    // same — impossible with a contiguous virtualizer window.
    const key = `${ids[0] ?? ""}|${ids[ids.length - 1] ?? ""}|${ids.length}`;
    if (key === prevVisibleKeyRef.current) {
      return prevVisibleImagesRef.current;
    }

    prevVisibleKeyRef.current = key;
    prevVisibleImagesRef.current = images;
    return images;
  }, [virtualItems, results]);

  const table = useReactTable({
    data: visibleImages,
    columns: visibleColumns,
    getCoreRowModel: getCoreRowModel(),
    columnResizeMode: "onChange",
    initialState: {
      columnSizing: initialColumnSizing,
    },
    onColumnSizingChange: (updater) => {
      // Let TanStack apply the update first
      table.setState((prev) => {
        const next =
          typeof updater === "function"
            ? updater(prev.columnSizing)
            : updater;
        // Persist to store
        setWidths(next);
        return { ...prev, columnSizing: next };
      });
    },
  });

  // ---------------------------------------------------------------------------
  // (C) CSS-variable column widths — compute once per sizing change
  // ---------------------------------------------------------------------------

  // Default sizes from column defs (stable — only depends on allColumns)
  const defaultColSizes = useMemo(() => {
    const map: Record<string, number> = {};
    for (const col of allColumns) {
      const id = getColumnId(col);
      map[id] = col.size ?? 150;
    }
    return map;
  }, []);

  // Visible column IDs (changes when visibility changes)
  const visibleColIds = useMemo(
    () => visibleColumns.map((c) => getColumnId(c)),
    [visibleColumns]
  );

  // CSS variable string — recomputed when column sizing or visibility changes.
  // During a resize drag TanStack updates columnSizing on every mousemove,
  // but only this string (injected via <style>) changes — the memoised
  // TableBody below does NOT re-render.
  const columnSizeVars = useMemo(
    () =>
      buildColumnSizeVars(
        visibleColIds,
        table.getState().columnSizing,
        defaultColSizes
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- we intentionally read table state
    [visibleColIds, table.getState().columnSizing, defaultColSizes]
  );

  const { rows } = table.getRowModel();

  // (D) Cache rows + virtualItems during resize to keep TableBody stable.
  // While a resize drag is in progress, the only thing that changes is
  // column widths — which come from CSS variables, not React props.
  // We freeze the body's input to prevent re-renders.
  const isResizing = !!table.getState().columnSizingInfo.isResizingColumn;
  const cachedRowsRef = useRef(rows);
  const cachedVirtualItemsRef = useRef(virtualItems);
  if (!isResizing) {
    cachedRowsRef.current = rows;
    cachedVirtualItemsRef.current = virtualItems;
  }

  // Restore focus and scroll when returning from image detail overlay.
  useReturnFromDetail({
    imageParam: searchParams.image,
    focusedImageId,
    setFocusedImageId,
    findImageIndex,
    virtualizer,
    flatIndexToRow: (idx) => idx,
  });


  // ---------------------------------------------------------------------------
  // Keyboard navigation — delegated to shared hook
  // ---------------------------------------------------------------------------

  useListNavigation({
    columnsPerRow: 1,
    virtualizer,
    scrollRef: parentRef,
    rowHeight: ROW_HEIGHT,
    headerHeight, // C.1: ResizeObserver-measured; same value as HEADER_HEIGHT on steady state
    focusedImageId,
    setFocusedImageId,
    virtualizerCount,
    getImage,
    findImageIndex,
    resultsLength: results.length,
    total,
    loadMore,
    onEnter: handleRowDoubleClick,
    imageParam: searchParams.image,
    flatIndexToRow: (idx) => idx, // table: flat index IS the row index
    resetScrollLeftOnHome: true,
    bufferOffset,
    seek,
  });

  // Clean up sort delay timer on unmount
  useEffect(() => {
    return () => {
      if (sortTimerRef.current) clearTimeout(sortTimerRef.current);
    };
  }, []);

  // Right-click on header cell → show column context menu
  const handleHeaderContextMenu = useCallback(
    (e: React.MouseEvent, columnId?: string) => {
      e.preventDefault();
      columnMenuRef.current?.open(e.clientX, e.clientY, columnId);
    },
    []
  );

  // Measure the pixel width needed to display a string at the table's
  // font.  Uses an off-screen canvas (cached) for speed.
  const measureCtxRef = useRef<CanvasRenderingContext2D | null>(null);
  // A.3: Cache last-set font string. ctx.font assignment triggers font-string
  // parsing even when the value is unchanged — expensive at ~600 calls per
  // column-fit. Skipping the assignment when the font hasn't changed avoids
  // re-parsing entirely (column-fit typically uses only 2 distinct fonts).
  const lastFontRef = useRef<string>("");
  const measureText = useCallback((text: string, font: string): number => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement("canvas");
      measureCtxRef.current = canvas.getContext("2d");
    }
    const ctx = measureCtxRef.current!;
    if (font !== lastFontRef.current) {
      ctx.font = font;
      lastFontRef.current = font;
    }
    return Math.ceil(ctx.measureText(text).width);
  }, []);

  // Compute the ideal width for a column based on visible data.
  // Scans only the current virtualizer window (visible + overscan, ~60 rows)
  // instead of all loaded results — at 50k+ loaded images the old full scan
  // would freeze the main thread. Visible-window fit is also better UX:
  // you're fitting to what you can actually see.
  const computeFitWidth = useCallback(
    (colId: string): number => {
      const col = allColumns.find((c) => getColumnId(c) === colId);
      if (!col) return 100;

      // px-2 = 8px each side, plus 4px for sort arrow, plus a little breathing room
      const PADDING = 8 + 8 + 16;
      // ⚠️ SYNC: these must match the font sizes rendered by CSS.
      //   Cell font  → text-xs  → --text-xs in index.css  (currently 13px)
      //   Header font → text-sm → Tailwind default         (currently 14px)
      // If you change font sizes in the theme, update these too.
      const CELL_FONT = "13px 'Open Sans', sans-serif";
      const HEADER_FONT = "600 14px 'Open Sans', sans-serif";

      // Header label width
      const headerLabel = typeof col.header === "string" ? col.header : colId;
      let maxW = measureText(headerLabel, HEADER_FONT);

      // Cell values — scan only the visible virtualizer window
      const vItems = virtualizer.getVirtualItems();
      const fieldDef = FIELDS_BY_ID.get(colId);
      // Pill columns (isList) render each value as a <DataSearchPill> with
      // px-1.5 (12px) inline padding per pill and gap-0.5 (2px) between pills.
      // Measuring the comma-joined string misses this overhead entirely —
      // the rendered pills are significantly wider than plain text.
      const PILL_PADDING = 12; // px-1.5 = 6px × 2
      const PILL_GAP = 2;     // gap-0.5 = 0.125rem ≈ 2px

      for (const vItem of vItems) {
        const image = vItem.index < results.length ? results[vItem.index] : undefined;
        if (!image) continue;

        let w: number;
        if (fieldDef?.isList) {
          // Sum individual pill widths instead of measuring joined string
          const values = fieldDef.accessor(image);
          if (!Array.isArray(values) || values.length === 0) continue;
          w = values.reduce(
            (sum, v) => sum + measureText(v, CELL_FONT) + PILL_PADDING,
            0
          ) + PILL_GAP * (values.length - 1);
        } else {
          const raw = getFieldRawValue(colId, image);
          if (!raw || raw === "—") continue;
          w = measureText(raw, CELL_FONT);
        }
        if (w > maxW) maxW = w;
      }

      return Math.max(50, maxW + PADDING);
    },
    [virtualizer, results, measureText]
  );

  // Resize a single column to fit its data
  const resizeColumnToFit = useCallback(
    (colId: string) => {
      const width = computeFitWidth(colId);
      table.setColumnSizing((prev) => ({ ...prev, [colId]: width }));
    },
    [computeFitWidth, table]
  );

  // Resize all visible columns to fit their data
  const resizeAllColumnsToFit = useCallback(() => {
    const sizing: Record<string, number> = {};
    for (const col of visibleColumns) {
      const id = getColumnId(col);
      sizing[id] = computeFitWidth(id);
    }
    table.setColumnSizing((prev) => ({ ...prev, ...sizing }));
  }, [computeFitWidth, visibleColumns, table]);

  // ---------------------------------------------------------------------------
  // Double-click header → auto-fit / restore
  //
  // First double-click: saves current width, then auto-fits.
  // Second double-click: restores the saved width.
  // Uses a 250ms timer to delay single-click (sort) so it doesn't fire
  // when the user is actually double-clicking.
  // ---------------------------------------------------------------------------
  const sortTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  /** Handle double-click on a column header: fit ↔ restore. */
  const handleHeaderDoubleClick = useCallback(
    (colId: string) => {
      const savedWidth = config.preDoubleClickWidths[colId];
      if (savedWidth !== undefined) {
        // Second double-click → restore previous width
        table.setColumnSizing((prev) => ({ ...prev, [colId]: savedWidth }));
        clearPreDoubleClickWidth(colId);
      } else {
        // First double-click → save current width, then auto-fit
        const currentWidth = table.getColumn(colId)?.getSize();
        if (currentWidth !== undefined) {
          setPreDoubleClickWidths({ [colId]: currentWidth });
        }
        const fitWidth = computeFitWidth(colId);
        table.setColumnSizing((prev) => ({ ...prev, [colId]: fitWidth }));
      }
    },
    [config.preDoubleClickWidths, table, computeFitWidth, clearPreDoubleClickWidth, setPreDoubleClickWidths]
  );

  // Column header click to sort
  const handleSort = useCallback(
    (field: string, e: React.MouseEvent | { shiftKey: boolean; altKey: boolean }) => {
      const orderBy = searchParams.orderBy ?? "-uploadTime";
      const parts = orderBy.split(",").map((s: string) => s.trim());
      const primary = parts[0];
      const secondary = parts[1];

      const primaryBare = primary.startsWith("-")
        ? primary.slice(1)
        : primary;

      if (e.shiftKey) {
        // Shift+click — manage secondary sort
        if (!secondary) {
          // No secondary yet — add it with natural default direction
          if (field !== primaryBare) {
            updateSearch({ orderBy: `${primary},${defaultSortFor(field)}` });
          }
        } else {
          const secondaryBare = secondary.startsWith("-")
            ? secondary.slice(1)
            : secondary;

          if (secondaryBare === field) {
            // Toggle secondary direction
            const newSecondary = secondary.startsWith("-")
              ? field
              : `-${field}`;
            updateSearch({ orderBy: `${primary},${newSecondary}` });
          } else if (field !== primaryBare) {
            // Move secondary to new field with natural default direction
            updateSearch({ orderBy: `${primary},${defaultSortFor(field)}` });
          }
        }
      } else {
        // Normal click — manage primary sort, clear secondary
        if (primaryBare === field) {
          // Toggle primary direction
          const newPrimary = primary.startsWith("-") ? field : `-${field}`;
          updateSearch({ orderBy: newPrimary });
        } else {
          // New primary — use natural default direction for this field type
          updateSearch({ orderBy: defaultSortFor(field) });
        }
      }
    },
    [searchParams.orderBy, updateSearch]
  );

  /**
   * Delayed click handler for sortable header cells.
   * Waits 250ms before triggering sort so a double-click can cancel it.
   */
  const handleDelayedSort = useCallback(
    (field: string, e: React.MouseEvent) => {
      // Clear any pending sort timer (e.g. from the first click of a double-click)
      if (sortTimerRef.current) {
        clearTimeout(sortTimerRef.current);
        sortTimerRef.current = null;
      }
      // Capture the values we need before the synthetic event is recycled
      const shiftKey = e.shiftKey;
      const altKey = e.altKey;
      sortTimerRef.current = setTimeout(() => {
        sortTimerRef.current = null;
        handleSort(field, { shiftKey, altKey });
      }, 250);
    },
    [handleSort]
  );

  // Map column IDs to their orderBy key for the URL.
  // Derived from the field registry — see field-registry.ts.
  const sortableFields = REGISTRY_SORTABLE_FIELDS;

  // Parse primary + secondary sort from the orderBy param
  const orderBy = searchParams.orderBy ?? "-uploadTime";
  const sortParts = orderBy.split(",").map((s: string) => s.trim());
  const primarySort = sortParts[0];
  const secondarySort = sortParts[1];
  const primaryBare = primarySort.startsWith("-")
    ? primarySort.slice(1)
    : primarySort;
  const primaryDesc = primarySort.startsWith("-");
  const secondaryBare = secondarySort?.startsWith("-")
    ? secondarySort.slice(1)
    : secondarySort;
  const secondaryDesc = secondarySort?.startsWith("-");

  // Auto-reveal: if the user sorts by a column that's currently hidden,
  // show it.  Uses toggleVisibility (same as the context menu) so the
  // store persists it as if the user toggled it manually.
  // Only fires when the primary sort field changes — not on direction toggles.
  useEffect(() => {
    // Build reverse map: orderBy key → column ID
    const orderByToColId: Record<string, string> = {};
    for (const [colId, orderByKey] of Object.entries(sortableFields)) {
      orderByToColId[orderByKey] = colId;
    }
    const colId = orderByToColId[primaryBare];
    if (colId && config.hidden.includes(colId)) {
      toggleVisibility(colId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- only react to sort field changes
  }, [primaryBare]);

  // Cell click: shift-click adds key:value, alt-click adds -key:value to query.
  // If the same key:value already exists with opposite polarity, flips it in-place.
  // If it already exists with the same polarity, does nothing (no-op).
  const handleCellClick = useCallback(
    (columnId: string, image: Image, e: React.MouseEvent) => {
      if (!e.shiftKey && !e.altKey) return;

      // Check for per-sub-field CQL key on the click target (e.g. Location column)
      const target = e.target as HTMLElement;
      const subFieldKey = target.closest<HTMLElement>("[data-cql-key]");

      let cqlKey: string | undefined;
      let rawValue: string | undefined;

      if (subFieldKey) {
        cqlKey = subFieldKey.dataset.cqlKey;
        rawValue = subFieldKey.dataset.cqlValue;
      } else {
        cqlKey = COLUMN_CQL_KEYS[columnId];
        rawValue = getFieldRawValue(columnId, image);
      }

      if (!cqlKey || !rawValue || rawValue === "—") return;

      const currentQuery = searchParamsRef.current.query ?? "";
      const newQuery = upsertFieldTerm(currentQuery, cqlKey, rawValue, e.altKey);

      if (newQuery !== currentQuery) {
        // Cancel any pending debounce from the CQL editor's queryChange flow
        // so it doesn't revert the query back to its previous value.
        // This also bumps the CqlSearchInput generation counter, forcing
        // the CQL editor to remount with the new value — working around a
        // @guardian/cql limitation where setAttribute("value", ...) doesn't
        // reliably re-render chips when only polarity changes.
        cancelSearchDebounce(newQuery);

        updateSearch({ query: newQuery });
      }
    },
    [updateSearch]
  );

  // ---------------------------------------------------------------------------
  // Horizontal scrollbar proxy — a thin native-scrollbar div at the bottom
  // that mirrors scrollLeft of the main (all-scrollbars-hidden) container.
  // This is the only cross-browser way to show a horizontal scrollbar while
  // hiding the vertical one: hide everything, then add an explicit proxy.
  // ---------------------------------------------------------------------------
  const hScrollRef = useRef<HTMLDivElement>(null);
  const hScrollInnerRef = useRef<HTMLDivElement>(null);
  const syncingRef = useRef(false); // guard against infinite scroll loops

  // Sync scrollLeft: main → proxy, proxy → main
  useEffect(() => {
    const main = parentRef.current;
    const proxy = hScrollRef.current;
    if (!main || !proxy) return;

    const syncMainToProxy = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      proxy.scrollLeft = main.scrollLeft;
      syncingRef.current = false;
    };
    const syncProxyToMain = () => {
      if (syncingRef.current) return;
      syncingRef.current = true;
      main.scrollLeft = proxy.scrollLeft;
      syncingRef.current = false;
    };

    main.addEventListener("scroll", syncMainToProxy, { passive: true });
    proxy.addEventListener("scroll", syncProxyToMain, { passive: true });
    return () => {
      main.removeEventListener("scroll", syncMainToProxy);
      proxy.removeEventListener("scroll", syncProxyToMain);
    };
  }, []);

  // Keep the proxy's inner width in sync with the main container's scrollWidth.
  // Uses ResizeObserver on the data-table-root element (the inline-block that
  // shrink-wraps to header width) to detect content width changes from column
  // resizes and visibility toggles.
  useEffect(() => {
    const main = parentRef.current;
    const inner = hScrollInnerRef.current;
    if (!main || !inner) return;

    const tableRoot = main.querySelector("[data-table-root]");
    if (!tableRoot) return;

    const sync = () => {
      inner.style.width = `${main.scrollWidth}px`;
    };
    sync();

    const ro = new ResizeObserver(sync);
    ro.observe(tableRoot);
    // Also watch the main container itself — its clientWidth changes on
    // panel resize, which affects whether the proxy scrollbar is needed.
    ro.observe(main);
    return () => ro.disconnect();
  }, []);

  return (
    <div className="flex-1 min-w-0 flex flex-col">
      <div ref={parentRef} role="region" aria-label="Image results table" className="flex-1 min-w-0 overflow-auto hide-scrollbar-y">
      {/* (C) CSS-variable column widths — a single <style> tag sets
          --col-<id> for every visible column.  Header and body cells
          reference these variables, so width changes during resize
          only touch this style string — the memoised body below
          does NOT re-render. */}
      <style
        dangerouslySetInnerHTML={{
          __html: `[data-table-root]{${columnSizeVars}}`,
        }}
      />
      {/* Inner wrapper: inline-block so it shrink-wraps to the header
          width (the width anchor).  min-w-full keeps it at least
          viewport-wide.  Rows are absolute and stretch via left-0/right-0. */}
      <div
        data-table-root
        role="grid"
        aria-label="Image search results"
        aria-rowcount={total}
        style={{ height: virtualizer.getTotalSize() }}
        className="relative inline-block min-w-full"
      >
        {/* Header: inline-flex so the browser sizes it from its children
            — no JS-computed width, correct at any browser zoom level. */}
        <div
          ref={headerCallbackRef}
          data-table-header
          role="row"
          className="sticky top-0 z-10 inline-flex bg-grid-bg border-b border-grid-separator h-11"
          onContextMenu={(e) => handleHeaderContextMenu(e)}
        >
          {table.getHeaderGroups().map((headerGroup) =>
            headerGroup.headers.map((header) => {
              const sortField = sortableFields[header.column.id];
              const isPrimary = sortField && primaryBare === sortField;
              const isSecondary = sortField && secondaryBare === sortField;

              // ARIA sort direction for screen readers
              const ariaSort: React.AriaAttributes["aria-sort"] = isPrimary
                ? primaryDesc
                  ? "descending"
                  : "ascending"
                : sortField
                  ? "none"
                  : undefined;

              return (
                <div
                  key={header.id}
                  role="columnheader"
                  aria-sort={ariaSort}
                  className={`relative flex items-center shrink-0 px-2 py-1.5 text-sm font-medium text-grid-text-muted tracking-wider select-none border-r border-grid-separator ${
                    sortField
                      ? "cursor-pointer hover:text-grid-text-bright hover:bg-grid-hover/50"
                      : ""
                  } ${isPrimary ? "text-grid-accent" : ""} ${isSecondary ? "text-grid-accent/65" : ""}`}
                  style={{ width: `var(--col-${header.column.id})` }}
                  onClick={
                    sortField
                      ? (e) => handleDelayedSort(sortField, e)
                      : undefined
                  }
                  onDoubleClick={(e) => {
                    e.preventDefault();
                    // Cancel any pending single-click sort
                    if (sortTimerRef.current) {
                      clearTimeout(sortTimerRef.current);
                      sortTimerRef.current = null;
                    }
                    handleHeaderDoubleClick(header.column.id);
                  }}
                  onContextMenu={(e) => {
                    e.stopPropagation();
                    handleHeaderContextMenu(e, header.column.id);
                  }}
                >
                  {flexRender(
                    header.column.columnDef.header,
                    header.getContext()
                  )}
                  {isPrimary && (
                    <span className="ml-1" aria-hidden="true">{primaryDesc ? "↓" : "↑"}</span>
                  )}
                  {isSecondary && (
                    <span className="ml-1 opacity-65" aria-hidden="true">
                      {secondaryDesc ? "↓↓" : "↑↑"}
                    </span>
                  )}
                  {/* Resize handle — pointer capture keeps events flowing
                      even outside the window; auto-scroll kicks in when
                      the cursor reaches the edges of the scroll container
                      and synthesizes mousemove events so TanStack keeps
                      resizing the column as the container scrolls. */}
                  <div
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${typeof header.column.columnDef.header === "string" ? header.column.columnDef.header : header.column.id} column`}
                    onPointerDown={(e) => {
                      const handle = e.currentTarget;
                      handle.setPointerCapture(e.pointerId);

                      // Manual resize invalidates any saved pre-fit width
                      clearPreDoubleClickWidth(header.column.id);

                      // Let TanStack set up its resize state
                      header.getResizeHandler()(e);

                      const scrollEl = parentRef.current;
                      if (!scrollEl) return;

                      let rafId = 0;
                      let lastClientX = e.clientX;
                      const scrollAtStart = scrollEl.scrollLeft;
                      const EDGE = 40; // px from edge where scroll starts
                      const MAX_SPEED = 20; // px per frame at maximum

                      const autoScroll = () => {
                        if (!scrollEl) return;
                        const rect = scrollEl.getBoundingClientRect();
                        const distFromLeft = lastClientX - rect.left;
                        const distFromRight = rect.right - lastClientX;

                        let speed = 0;
                        if (distFromLeft < EDGE) {
                          speed = -MAX_SPEED * Math.max(0, (EDGE - distFromLeft) / EDGE);
                        } else if (distFromRight < EDGE) {
                          speed = MAX_SPEED * Math.max(0, (EDGE - distFromRight) / EDGE);
                        }

                        if (speed !== 0) {
                          scrollEl.scrollLeft += speed;
                        }

                        // How far the container has scrolled since the drag
                        // started.  Shift the virtual clientX by this amount
                        // so TanStack sees the cursor "moving" with the scroll.
                        // Scroll left → scrollDelta < 0 → virtual clientX
                        // decreases → column shrinks.  Vice versa for right.
                        const scrollDelta = scrollEl.scrollLeft - scrollAtStart;
                        if (scrollDelta !== 0) {
                          document.dispatchEvent(
                            new MouseEvent("mousemove", {
                              clientX: lastClientX + scrollDelta,
                              clientY: 0,
                              bubbles: true,
                            })
                          );
                        }

                        rafId = requestAnimationFrame(autoScroll);
                      };
                      rafId = requestAnimationFrame(autoScroll);

                      const onMove = (ev: PointerEvent) => {
                        lastClientX = ev.clientX;
                      };
                      const onUp = (ev: PointerEvent) => {
                        cancelAnimationFrame(rafId);

                        // If scrolling happened during the drag, dispatch a
                        // final synthetic mouseup with the scroll-adjusted
                        // clientX so TanStack finalises at the correct width.
                        const scrollDelta = scrollEl.scrollLeft - scrollAtStart;
                        if (scrollDelta !== 0) {
                          // Prevent the real mouseup (from pointer capture
                          // compatibility) from reaching TanStack with the
                          // unadjusted clientX.
                          const blockRealMouseUp = (me: MouseEvent) => {
                            if (!me.isTrusted) return; // let our synthetic through
                            me.stopImmediatePropagation();
                          };
                          document.addEventListener("mouseup", blockRealMouseUp, true);

                          document.dispatchEvent(
                            new MouseEvent("mouseup", {
                              clientX: ev.clientX + scrollDelta,
                              clientY: ev.clientY,
                              bubbles: true,
                            })
                          );

                          // Remove the blocker after the real event has been
                          // suppressed (it fires synchronously after pointerup)
                          requestAnimationFrame(() => {
                            document.removeEventListener("mouseup", blockRealMouseUp, true);
                          });
                        }

                        handle.removeEventListener("pointermove", onMove);
                        handle.removeEventListener("pointerup", onUp);
                        handle.removeEventListener("pointercancel", onUp);
                      };
                      handle.addEventListener("pointermove", onMove);
                      handle.addEventListener("pointerup", onUp);
                      handle.addEventListener("pointercancel", onUp);
                    }}
                    className="absolute right-0 top-0 h-full w-1 cursor-col-resize hover:bg-grid-accent/50"
                    onClick={(e) => e.stopPropagation()}
                  />
                </div>
              );
            })
          )}
          {/* Trailing spacer — gives the last column's resize handle room
              and prevents content from being flush against the table edge */}
          <div className="shrink-0 w-8" aria-hidden="true" />
        </div>

        {/* (D) Memoised body — does not re-render during resize drag.
            Column widths come from CSS variables, updated by the <style>
            tag above without any React involvement.  Rows and virtualItems
            are cached in refs during resize so props stay stable. */}
        <TableBody
          virtualItems={cachedVirtualItemsRef.current}
          rows={cachedRowsRef.current}
          handleCellClick={handleCellClick}
          handleRowDoubleClick={handleRowDoubleClick}
          handleRowClick={handleRowClick}
          focusedImageId={focusedImageId}
          visibleColumnCount={visibleColIds.length}
          getImage={getImage}
        />
      </div>

      {/* Loading indicator at bottom */}
      {loading && results.length > 0 && (
        <div
          role="status"
          aria-live="polite"
          className="sticky bottom-0 flex items-center justify-center py-2 bg-grid-bg/80 text-sm text-grid-accent"
        >
          Loading more…
        </div>
      )}

      {/* Column context menu */}
      <ColumnContextMenu
        ref={columnMenuRef}
        columns={allColumns}
        getColumnId={getColumnId}
        hiddenColumnIds={config.hidden}
        onToggleVisibility={toggleVisibility}
        onResizeColumnToFit={resizeColumnToFit}
        onResizeAllColumnsToFit={resizeAllColumnsToFit}
      />
    </div>

    {/* Horizontal scrollbar proxy — native scrollbar on a thin div that
        syncs scrollLeft with the main container above. This is the only
        cross-browser way to show a horizontal scrollbar while hiding the
        vertical one (scrollbar-width:none hides both in all modern browsers). */}
    <div
      ref={hScrollRef}
      className="shrink-0 overflow-x-auto overflow-y-hidden"
      style={{ height: 12 }}
      aria-hidden="true"
    >
      <div ref={hScrollInnerRef} style={{ height: 1 }} />
    </div>
  </div>
  );
}

