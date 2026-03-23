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
import { useColumnStore } from "@/stores/column-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { ColumnContextMenu, type ColumnContextMenuHandle } from "./ColumnContextMenu";
import type { Image } from "@/types/image";
import { upsertFieldTerm } from "@/lib/cql-query-edit";
import { cancelSearchDebounce } from "./SearchBar";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";
import { URL_DISPLAY_KEYS, type UrlSearchParams } from "@/lib/search-params-schema";
import {
  FIELD_REGISTRY,
  COLUMN_CQL_KEYS,
  SORTABLE_FIELDS as REGISTRY_SORTABLE_FIELDS,
  DESC_BY_DEFAULT,
  getFieldRawValue,
  type FieldDefinition,
} from "@/lib/field-registry";

const columnHelper = createColumnHelper<Image>();

// ---------------------------------------------------------------------------
// Build TanStack column defs from the field registry
// ---------------------------------------------------------------------------

/**
 * Build a cell renderer for a list field (subjects, people).
 * Each item is individually clickable for search via data-cql-key/data-cql-value.
 */
function listCellRenderer(field: FieldDefinition) {
  return (image: Image) => {
    const values = field.accessor(image);
    if (!Array.isArray(values) || values.length === 0) return "—";
    return (
      <>
        {values.map((v, i) => (
          <span key={i}>
            {i > 0 && <span className="text-grid-text-dim">, </span>}
            <span
              data-cql-key={field.cqlKey}
              data-cql-value={v}
              className="hover:underline hover:text-grid-accent cursor-pointer"
            >
              {v}
            </span>
          </span>
        ))}
      </>
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

const ROW_HEIGHT = 32;
/** Sticky table header height including border (h-11 + 1px border-b).
 *  Used as scrollPaddingStart so the virtualizer's scrollToIndex doesn't
 *  consider rows behind the header as "visible". */
const HEADER_HEIGHT = 45;

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
              <div className="animate-pulse bg-grid-separator/20 h-3 mx-4 rounded flex-1 max-w-xs" />
            </div>
          );
        }

        // Real row — find the matching TanStack Row for cell rendering
        const row = rowsById.get(image.id);
        if (!row) {
          // Image loaded but not yet in TanStack Table's row model
          // (can happen briefly during the render between store update
          // and Table re-render). Show placeholder.
          return (
            <div
              key={`pending-${virtualRow.index}`}
              role="row"
              aria-rowindex={virtualRow.index + 2}
              className="absolute left-0 right-0 flex items-center border-b border-grid-separator/30"
              style={{
                height: `${virtualRow.size}px`,
                transform: `translateY(${virtualRow.start}px)`,
              }}
            >
              <div className="animate-pulse bg-grid-separator/20 h-3 mx-4 rounded flex-1 max-w-xs" />
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
                ? "bg-grid-hover/40"
                : "hover:bg-grid-hover/30"
            }`}
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
              ...(isFocused ? { boxShadow: "inset 2px 0 0 var(--color-grid-accent)" } : undefined),
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
                  className="flex items-center shrink-0 px-2 text-sm text-grid-text truncate border-r border-grid-separator/20"
                  style={{ width: `var(--col-${cell.column.id})` }}
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
    results, total, virtualizerCount, loading, loadMore,
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
      navigate({
        to: "/search",
        search: (prev: Record<string, unknown>) => ({ ...prev, image: imageId }),
      });
    },
    [navigate, setFocusedImageId],
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
    overscan: 20,
    // Account for sticky header — without this, scrollToIndex considers
    // rows behind the header as "visible" and won't scroll to them.
    // Subtract one ROW_HEIGHT because the padding is additive with the
    // virtualizer's own item-boundary snapping.
    scrollPaddingStart: HEADER_HEIGHT - ROW_HEIGHT,
    // Buffer at the bottom so the focused row is never clipped by the
    // viewport edge at any zoom level.
    scrollPaddingEnd: ROW_HEIGHT * 2,
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
  const visibleImages = useMemo(() => {
    const images: Image[] = [];
    for (const vItem of virtualItems) {
      const img = vItem.index < results.length ? results[vItem.index] : undefined;
      if (img) images.push(img);
    }
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

  // Scroll handler: report the visible index range to useDataWindow for
  // gap detection + range loading. Also keeps the old loadMore fallback
  // for sequential scroll near the bottom of loaded data.
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el) return;

    // Report visible range for sparse gap detection
    const virtualItems = virtualizer.getVirtualItems();
    if (virtualItems.length > 0) {
      const firstIdx = virtualItems[0].index;
      const lastIdx = virtualItems[virtualItems.length - 1].index;
      reportVisibleRange(firstIdx, lastIdx);
    }

    // Fallback: append-only loadMore when near the bottom (for small
    // datasets where sparse scroll isn't needed)
    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && results.length < total) {
      loadMore();
    }
  }, [virtualizer, reportVisibleRange, results.length, total, loadMore]);

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, [handleScroll]);

  // Reset scroll position when search params change.  loadMore doesn't
  // change URL params, so this only fires on genuinely new searches.
  //
  // When only the sort order changes (clicking a column header), scroll
  // position is preserved — the same data is just reordered, so jumping
  // to the top or losing horizontal position would be disorienting.
  // All other param changes (query, filters, logo click) reset to top-left.
  const prevSearchParamsRef = useRef(searchParams);
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    const prev = prevSearchParamsRef.current;
    prevSearchParamsRef.current = searchParams;

    // Check if orderBy is the only thing that changed — and it's a sort
    // action (adding or toggling), not a reset (orderBy cleared by logo click).
    // Exclude display-only keys (e.g. imageId) — they don't affect search
    // results and should never trigger a scroll reset.
    const orderByChanged = prev.orderBy !== searchParams.orderBy;
    const isSortAction = orderByChanged && searchParams.orderBy != null;
    const nonSortChanged = Object.keys({ ...prev, ...searchParams }).some(
      (key) =>
        key !== "orderBy" &&
        !URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) &&
        prev[key as keyof typeof prev] !== searchParams[key as keyof typeof searchParams]
    );
    const sortOnly = isSortAction && !nonSortChanged;

    // If only display-only keys changed, don't reset scroll at all
    const onlyDisplayKeysChanged = Object.keys({ ...prev, ...searchParams }).every(
      (key) =>
        URL_DISPLAY_KEYS.has(key as keyof UrlSearchParams) ||
        prev[key as keyof typeof prev] === searchParams[key as keyof typeof searchParams]
    );
    if (onlyDisplayKeysChanged) return;

    if (!sortOnly) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [searchParams]);

  // Set focus when returning from image detail.
  // When the `image` URL param disappears (user pressed Back), update
  // focus to the last viewed image so it's highlighted in the table.
  // Scroll position is preserved natively (the table stays fully laid out
  // while hidden — opacity:0, not display:none). Only scroll if the user
  // navigated to a different image via prev/next in image detail.
  const prevImageParam = useRef(searchParams.image);
  useEffect(() => {
    const wasViewing = prevImageParam.current;
    prevImageParam.current = searchParams.image;

    // Only act on the transition: image param was set → now gone
    if (!wasViewing || searchParams.image) return;

    const previousFocus = focusedImageIdRef.current;
    setFocusedImageId(wasViewing);

    // If the user navigated to a different image (prev/next in detail),
    // the focused row changed — center it in the viewport. "center" not
    // "auto" because the user has never seen this row's table position,
    // so placing it in the middle gives equal context above and below.
    if (wasViewing !== previousFocus) {
      const idx = findImageIndex(wasViewing);
      if (idx >= 0) {
        requestAnimationFrame(() => {
          virtualizer.scrollToIndex(idx, { align: "center" });
        });
      }
    }
  }, [searchParams.image, findImageIndex, virtualizer, setFocusedImageId]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation — focus-based (replaces pure viewport scrolling)
  //
  // Arrow Up/Down: move focus one row, scroll to keep focused row visible
  // PageUp/PageDown: move focus by one viewport-full of rows
  // Home: focus first row
  // End: focus last loaded row (triggers loadMore if more exist)
  //
  // Arrow/Page keys propagate out of the CQL input via its keysToPropagate
  // list, so we handle them in the normal bubble phase.
  //
  // Home/End need special treatment: the CQL input contains a ProseMirror
  // editor inside shadow DOM that would move the cursor on Home/End before
  // our bubble-phase handler fires. We use a **capture-phase** listener
  // on `document` to intercept them before they reach the shadow DOM.
  // ---------------------------------------------------------------------------

  // Refs for keyboard handler — avoids re-registering listeners on every
  // focus/rows change (which would be every render).
  const focusedImageIdRef = useRef(focusedImageId);
  focusedImageIdRef.current = focusedImageId;
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const virtualizerCountRef = useRef(virtualizerCount);
  virtualizerCountRef.current = virtualizerCount;
  const getImageRef = useRef(getImage);
  getImageRef.current = getImage;
  const findImageIndexRef = useRef(findImageIndex);
  findImageIndexRef.current = findImageIndex;

  const moveFocus = useCallback(
    (delta: number) => {
      const count = virtualizerCountRef.current;
      if (count === 0) return;

      const currentId = focusedImageIdRef.current;
      let currentIdx = currentId
        ? findImageIndexRef.current(currentId)
        : -1;

      // If no focus yet, start from top (down) or bottom (up)
      if (currentIdx < 0) {
        currentIdx = delta > 0 ? -1 : count;
      }

      // Move by delta, clamped to valid range.
      // If the target is a placeholder, try up to 10 neighbours in the
      // same direction to find a loaded row. If none within 10, just
      // focus the target — gap detection will load it.
      const rawTarget = currentIdx + delta;
      let nextIdx = Math.max(0, Math.min(count - 1, rawTarget));
      const step = delta > 0 ? 1 : -1;
      const MAX_SKIP = 10;
      if (!getImageRef.current(nextIdx)) {
        for (let skip = 1; skip <= MAX_SKIP; skip++) {
          const candidate = nextIdx + step * skip;
          if (candidate < 0 || candidate >= count) break;
          if (getImageRef.current(candidate)) {
            nextIdx = candidate;
            break;
          }
        }
      }

      const nextImage = getImageRef.current(nextIdx);
      if (nextImage) {
        setFocusedImageId(nextImage.id);
      }
      virtualizer.scrollToIndex(nextIdx, { align: "auto" });

      // Load more when approaching the end
      if (count - nextIdx <= 5 && results.length < total) {
        loadMore();
      }
    },
    [setFocusedImageId, virtualizer, results.length, total, loadMore],
  );

  // PageUp/PageDown: scroll the viewport by one page, then place focus at
  // the edge of the new viewport. This matches Finder/Explorer — the
  // viewport is the primary action, focus follows.
  //
  // PageDown: scroll down one page, focus the last fully visible row.
  // PageUp: scroll up one page, focus the first fully visible row.
  const pageFocus = useCallback(
    (direction: "up" | "down") => {
      const el = parentRef.current;
      const count = virtualizerCountRef.current;
      if (!el || count === 0) return;

      const headerEl = el.querySelector<HTMLElement>("[data-table-header]");
      const headerHeight = headerEl?.offsetHeight ?? 0;
      const viewportRowSpace = el.clientHeight - headerHeight;
      const pageRows = Math.max(1, Math.floor(viewportRowSpace / ROW_HEIGHT));

      if (direction === "down") {
        // Scroll down one page
        el.scrollTop = Math.min(
          el.scrollHeight - el.clientHeight,
          el.scrollTop + pageRows * ROW_HEIGHT,
        );
        // Focus the last fully visible row in the new viewport
        const lastVisibleIdx = Math.min(
          count - 1,
          Math.floor((el.scrollTop + el.clientHeight - headerHeight) / ROW_HEIGHT) - 1,
        );
        const img = lastVisibleIdx >= 0 ? getImageRef.current(lastVisibleIdx) : undefined;
        if (img) {
          setFocusedImageId(img.id);
        }
        // Load more when approaching the end
        if (count - lastVisibleIdx <= 5 && results.length < total) {
          loadMore();
        }
      } else {
        // Scroll up one page
        el.scrollTop = Math.max(0, el.scrollTop - pageRows * ROW_HEIGHT);
        // Focus the first fully visible row in the new viewport
        const firstVisibleIdx = Math.max(
          0,
          Math.ceil((el.scrollTop + headerHeight) / ROW_HEIGHT),
        );
        const img = getImageRef.current(firstVisibleIdx);
        if (img) {
          setFocusedImageId(img.id);
        }
      }
    },
    [setFocusedImageId, results.length, total, loadMore],
  );

  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    // Bubble-phase handler: arrows + PageUp/PageDown
    // Skip when image detail overlay is showing.
    const handleBubble = (e: KeyboardEvent) => {
      if (searchParamsRef.current.image) return; // image detail is showing
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          moveFocus(-1);
          break;
        case "ArrowDown":
          e.preventDefault();
          moveFocus(1);
          break;
        case "PageUp":
          e.preventDefault();
          pageFocus("up");
          break;
        case "PageDown":
          e.preventDefault();
          pageFocus("down");
          break;
        case "Enter": {
          // Enter on focused row → open image detail (same as double-click)
          if (searchParamsRef.current.image) return;
          const id = focusedImageIdRef.current;
          if (id) {
            e.preventDefault();
            handleRowDoubleClick(id);
          }
          break;
        }
        default:
          return;
      }
    };

    // Capture-phase handler: Home/End
    // Fires before the event reaches the CQL input's shadow DOM, so
    // preventDefault() stops ProseMirror from also moving the cursor.
    // Skip when image detail overlay is showing.
    const handleCapture = (e: KeyboardEvent) => {
      if (searchParamsRef.current.image) return; // image detail is showing
      switch (e.key) {
        case "Home":
          e.preventDefault();
          el.scrollTop = 0;
          el.scrollLeft = 0;
          {
            const firstImage = getImageRef.current(0);
            if (firstImage) setFocusedImageId(firstImage.id);
          }
          break;
        case "End":
          e.preventDefault();
          el.scrollTop = el.scrollHeight - el.clientHeight;
          {
            // Focus the last loaded row near the end — cap scan to 50
            // indices to avoid O(100k) backwards walk on sparse array
            const count = virtualizerCountRef.current;
            const scanFrom = Math.max(0, count - 50);
            for (let i = count - 1; i >= scanFrom; i--) {
              const img = getImageRef.current(i);
              if (img) {
                setFocusedImageId(img.id);
                break;
              }
            }
            // Load more when at the end
            if (results.length < total) {
              loadMore();
            }
          }
          break;
        default:
          return;
      }
    };

    document.addEventListener("keydown", handleBubble);
    document.addEventListener("keydown", handleCapture, true); // capture phase
    return () => {
      document.removeEventListener("keydown", handleBubble);
      document.removeEventListener("keydown", handleCapture, true);
    };
  }, [moveFocus, pageFocus, handleRowDoubleClick, setFocusedImageId, results.length, total, loadMore]);

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
  const measureText = useCallback((text: string, font: string): number => {
    if (!measureCtxRef.current) {
      const canvas = document.createElement("canvas");
      measureCtxRef.current = canvas.getContext("2d");
    }
    const ctx = measureCtxRef.current!;
    ctx.font = font;
    return Math.ceil(ctx.measureText(text).width);
  }, []);

  // Compute the ideal width for a column based on loaded data.
  // Checks both the header label and all visible cell values.
  const computeFitWidth = useCallback(
    (colId: string): number => {
      const col = allColumns.find((c) => getColumnId(c) === colId);
      if (!col) return 100;

      // px-2 = 8px each side, plus 4px for sort arrow, plus a little breathing room
      const PADDING = 8 + 8 + 16;
      const CELL_FONT = "14px 'Open Sans', sans-serif"; // text-sm
      const HEADER_FONT = "600 12px 'Open Sans', sans-serif"; // text-xs font-medium

      // Header label width
      const headerLabel = typeof col.header === "string" ? col.header : colId;
      let maxW = measureText(headerLabel, HEADER_FONT);

      // Cell values — scan loaded results only (for...in skips sparse holes)
      for (const key in results) {
        const image = results[Number(key)];
        if (!image) continue;
        const raw = getFieldRawValue(colId, image);
        if (raw && raw !== "—") {
          const w = measureText(raw, CELL_FONT);
          if (w > maxW) maxW = w;
        }
      }

      return Math.max(50, maxW + PADDING);
    },
    [results, measureText]
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

  return (
    <div ref={parentRef} role="region" aria-label="Image results table" className="flex-1 min-w-0 overflow-auto">
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
          data-table-header
          role="row"
          className="sticky top-0 z-10 inline-flex bg-grid-panel border-b border-grid-separator h-11"
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
                  className={`relative flex items-center shrink-0 px-2 py-1.5 text-xs font-medium text-grid-text-muted tracking-wider select-none border-r border-grid-separator ${
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
          className="sticky bottom-0 flex items-center justify-center py-2 bg-grid-bg/80 text-xs text-grid-accent"
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
  );
}

