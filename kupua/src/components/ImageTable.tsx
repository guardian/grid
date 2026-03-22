import {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
import { useSearchStore } from "@/stores/search-store";
import { useColumnStore } from "@/stores/column-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import type { Image } from "@/types/image";
import { format } from "date-fns";
import { upsertFieldTerm } from "@/lib/cql-query-edit";
import { cancelSearchDebounce } from "./SearchBar";
import { gridConfig, type FieldAlias } from "@/lib/grid-config";
import { getThumbnailUrl, thumbnailsEnabled } from "@/lib/image-urls";

const columnHelper = createColumnHelper<Image>();

function formatDate(dateStr?: string): string {
  if (!dateStr) return "—";
  try {
    return format(new Date(dateStr), "dd MMM yyyy HH:mm");
  } catch {
    return dateStr;
  }
}

/** Read width from orientedDimensions (post-EXIF rotation), falling back to dimensions. */
function getWidth(image: Image): number | undefined {
  return (image.source.orientedDimensions ?? image.source.dimensions)?.width;
}

/** Read height from orientedDimensions (post-EXIF rotation), falling back to dimensions. */
function getHeight(image: Image): number | undefined {
  return (image.source.orientedDimensions ?? image.source.dimensions)?.height;
}

/** Join location sub-fields fine→coarse: subLocation, city, state, country. */
function getLocation(image: Image): string | undefined {
  const parts = [
    image.metadata?.subLocation,
    image.metadata?.city,
    image.metadata?.state,
    image.metadata?.country,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : undefined;
}

// ---------------------------------------------------------------------------
// Config-driven field alias columns
// ---------------------------------------------------------------------------

/**
 * Resolve a dot-separated ES path against an image document.
 * e.g. "fileMetadata.iptc.Edit Status" → image.fileMetadata?.iptc?.["Edit Status"]
 *
 * Mirrors Grid's Scala `nestedLookup` in ImageResponse.
 */
function resolveEsPath(image: Image, esPath: string): string | undefined {
  const parts = esPath.split(".");
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let current: any = image;
  for (const part of parts) {
    if (current == null || typeof current !== "object") return undefined;
    current = current[part];
  }
  return current != null ? String(current) : undefined;
}

/** Field aliases that should appear as table columns. */
const aliasColumns: FieldAlias[] = gridConfig.fieldAliases.filter(
  (a) => a.displayInAdditionalMetadata
);

/** Column ID for a field alias — prefixed to avoid clashes with hardcoded columns. */
function aliasColumnId(alias: FieldAlias): string {
  return `alias_${alias.alias}`;
}

/** CQL keys for config-driven alias columns. */
const ALIAS_CQL_KEYS: Record<string, string> = Object.fromEntries(
  aliasColumns.map((a) => [aliasColumnId(a), a.alias])
);

/** Sortable fields for config-driven alias columns (all are keyword type). */
const ALIAS_SORTABLE_FIELDS: Record<string, string> = Object.fromEntries(
  aliasColumns.map((a) => [aliasColumnId(a), a.elasticsearchPath])
);

/** Generate TanStack column definitions from config field aliases. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const aliasColumnDefs: ColumnDef<Image, any>[] = aliasColumns.map((a) =>
  columnHelper.accessor((row) => resolveEsPath(row, a.elasticsearchPath), {
    id: aliasColumnId(a),
    header: a.label,
    size: 120,
    cell: (info) => info.getValue() || "—",
  })
);

/**
 * CQL key for each column, used for click-to-search.
 * Matches the CQL query syntax. Columns without a CQL key
 * don't support click-to-search.
 *
 * Date columns (taken, uploaded, lastModified) are intentionally excluded —
 * searching for an exact ISO timestamp isn't useful and the CQL parser
 * doesn't support date-valued field queries anyway.
 */
const COLUMN_CQL_KEYS: Record<string, string> = {
  metadata_imageType: "imageType",
  metadata_title: "title",
  metadata_description: "description",
  metadata_specialInstructions: "specialInstructions",
  metadata_byline: "by",
  metadata_credit: "credit",
  metadata_copyright: "copyright",
  metadata_source: "source",
  uploadedBy: "uploader",
  uploadInfo_filename: "filename",
  source_mimeType: "fileType",
  usageRights_category: "category",
  metadata_suppliersReference: "suppliersReference",
  metadata_bylineTitle: "bylineTitle",
  ...ALIAS_CQL_KEYS,
};

/**
 * Get the raw string value from a cell for tooltip and click-to-search.
 * Returns the display-friendly value (not the raw ES value) for special columns.
 */
function getRawCellValue(columnId: string, image: Image): string | undefined {
  switch (columnId) {
    case "metadata_imageType":
      return image.metadata?.imageType;
    case "metadata_title":
      return image.metadata?.title;
    case "metadata_description":
      return image.metadata?.description;
    case "metadata_specialInstructions":
      return image.metadata?.specialInstructions;
    case "metadata_byline":
      return image.metadata?.byline;
    case "metadata_credit":
      return image.metadata?.credit;
    case "metadata_copyright":
      return image.metadata?.copyright;
    case "metadata_source":
      return image.metadata?.source;
    case "location":
      return getLocation(image);
    case "subjects":
      return image.metadata?.subjects?.join(", ");
    case "people":
      return image.metadata?.peopleInImage?.join(", ");
    case "metadata_dateTaken":
      return image.metadata?.dateTaken;
    case "uploadTime":
      return image.uploadTime;
    case "lastModified":
      return image.lastModified;
    case "uploadedBy":
      return image.uploadedBy;
    case "uploadInfo_filename":
      return image.uploadInfo?.filename;
    case "width": {
      const w = getWidth(image);
      return w !== undefined ? String(w) : undefined;
    }
    case "height": {
      const h = getHeight(image);
      return h !== undefined ? String(h) : undefined;
    }
    case "source_mimeType": {
      const mime = image.source.mimeType;
      return mime ? mime.replace("image/", "") : undefined;
    }
    case "usageRights_category":
      return image.usageRights?.category;
    case "metadata_suppliersReference":
      return image.metadata?.suppliersReference;
    case "metadata_bylineTitle":
      return image.metadata?.bylineTitle;
    default: {
      // Config-driven alias columns
      const alias = aliasColumns.find((a) => aliasColumnId(a) === columnId);
      if (alias) return resolveEsPath(image, alias.elasticsearchPath);
      return undefined;
    }
  }
}

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
  columnHelper.accessor((row) => row.usageRights?.category, {
    id: "usageRights_category",
    header: "Category",
    size: 140,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.imageType, {
    id: "metadata_imageType",
    header: "Image type",
    size: 100,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.title, {
    id: "metadata_title",
    header: "Title",
    size: 250,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.description, {
    id: "metadata_description",
    header: "Description",
    size: 300,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.specialInstructions, {
    id: "metadata_specialInstructions",
    header: "Special instructions",
    size: 200,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.byline, {
    id: "metadata_byline",
    header: "By",
    size: 150,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.credit, {
    id: "metadata_credit",
    header: "Credit",
    size: 120,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => getLocation(row), {
    id: "location",
    header: "Location",
    size: 200,
    cell: (info) => {
      const m = info.row.original.metadata;
      const parts: { cqlKey: string; value: string }[] = [];
      if (m?.subLocation) parts.push({ cqlKey: "location", value: m.subLocation });
      if (m?.city) parts.push({ cqlKey: "city", value: m.city });
      if (m?.state) parts.push({ cqlKey: "state", value: m.state });
      if (m?.country) parts.push({ cqlKey: "country", value: m.country });
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
    },
  }),
  columnHelper.accessor((row) => row.metadata?.copyright, {
    id: "metadata_copyright",
    header: "Copyright",
    size: 180,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.source, {
    id: "metadata_source",
    header: "Source",
    size: 120,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.dateTaken, {
    id: "metadata_dateTaken",
    header: "Taken on",
    size: 150,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("uploadTime", {
    header: "Uploaded",
    size: 150,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("lastModified", {
    header: "Last modified",
    size: 150,
    cell: (info) => formatDate(info.getValue()),
  }),
  columnHelper.accessor("uploadedBy", {
    header: "Uploader",
    size: 150,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.uploadInfo?.filename, {
    id: "uploadInfo_filename",
    header: "Filename",
    size: 180,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.subjects?.join(", "), {
    id: "subjects",
    header: "Subjects",
    size: 200,
    cell: (info) => {
      const subjects = info.row.original.metadata?.subjects;
      if (!subjects || subjects.length === 0) return "—";
      return (
        <>
          {subjects.map((s, i) => (
            <span key={i}>
              {i > 0 && <span className="text-grid-text-dim">, </span>}
              <span
                data-cql-key="subject"
                data-cql-value={s}
                className="hover:underline hover:text-grid-accent cursor-pointer"
              >
                {s}
              </span>
            </span>
          ))}
        </>
      );
    },
  }),
  columnHelper.accessor((row) => row.metadata?.peopleInImage?.join(", "), {
    id: "people",
    header: "People",
    size: 200,
    cell: (info) => {
      const people = info.row.original.metadata?.peopleInImage;
      if (!people || people.length === 0) return "—";
      return (
        <>
          {people.map((p, i) => (
            <span key={i}>
              {i > 0 && <span className="text-grid-text-dim">, </span>}
              <span
                data-cql-key="person"
                data-cql-value={p}
                className="hover:underline hover:text-grid-accent cursor-pointer"
              >
                {p}
              </span>
            </span>
          ))}
        </>
      );
    },
  }),
  columnHelper.accessor((row) => getWidth(row), {
    id: "width",
    header: "Width",
    size: 70,
    cell: (info) => {
      const val = info.getValue();
      return val !== undefined ? val.toLocaleString() : "—";
    },
  }),
  columnHelper.accessor((row) => getHeight(row), {
    id: "height",
    header: "Height",
    size: 70,
    cell: (info) => {
      const val = info.getValue();
      return val !== undefined ? val.toLocaleString() : "—";
    },
  }),
  columnHelper.accessor((row) => row.source?.mimeType, {
    id: "source_mimeType",
    header: "File type",
    size: 90,
    cell: (info) => {
      const val = info.getValue();
      return val ? val.replace("image/", "") : "—";
    },
  }),
  columnHelper.accessor((row) => row.metadata?.suppliersReference, {
    id: "metadata_suppliersReference",
    header: "Suppliers reference",
    size: 150,
    cell: (info) => info.getValue() || "—",
  }),
  columnHelper.accessor((row) => row.metadata?.bylineTitle, {
    id: "metadata_bylineTitle",
    header: "Byline title",
    size: 150,
    cell: (info) => info.getValue() || "—",
  }),
  ...aliasColumnDefs,
];

const ROW_HEIGHT = 32;

/**
 * Fields whose natural first-sort direction is descending (newest first).
 * All other sortable fields default to ascending (A→Z for text, 0→∞ for numbers).
 */
const DESC_BY_DEFAULT = new Set([
  "taken",
  "uploadTime",
  "lastModified",
]);

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
  /** Number of visible columns — used to bust memo when column visibility changes. */
  visibleColumnCount: number;
}

const TableBody = memo(function TableBody({
  virtualItems,
  rows,
  handleCellClick,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- only used to bust memo
  visibleColumnCount: _,
}: TableBodyProps) {
  return (
    <>
      {virtualItems.map((virtualRow) => {
        const row = rows[virtualRow.index];
        return (
          <div
            key={row.id}
            role="row"
            aria-rowindex={virtualRow.index + 2} // +2: 1-based, header is row 1
            className="absolute left-0 right-0 flex hover:bg-grid-hover/30 border-b border-grid-separator/30"
            style={{
              height: `${virtualRow.size}px`,
              transform: `translateY(${virtualRow.start}px)`,
            }}
          >
            {row.getVisibleCells().map((cell) => {
              const rawValue = getRawCellValue(
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
  const { results, total, loading, loadMore } = useSearchStore();
  const {
    config,
    toggleVisibility,
    setWidths,
    setPreDoubleClickWidths,
    clearPreDoubleClickWidth,
  } = useColumnStore();
  const updateSearch = useUpdateSearchParams();
  const searchParams = useSearch({ from: "/" });
  const searchParamsRef = useRef(searchParams);
  searchParamsRef.current = searchParams;
  const parentRef = useRef<HTMLDivElement>(null);

  // Context menu state
  const [menuPos, setMenuPos] = useState<{
    x: number;
    y: number;
    columnId?: string; // which column header was right-clicked
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu on outside click, scroll, or Escape
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("scroll", close, true);
    document.addEventListener("keydown", handleKeyDown);

    // Clamp menu position so it stays fully on-screen
    requestAnimationFrame(() => {
      const menu = menuRef.current;
      if (!menu) return;
      const rect = menu.getBoundingClientRect();
      let { x, y } = menuPos;
      if (rect.right > window.innerWidth) x = window.innerWidth - rect.width - 4;
      if (rect.bottom > window.innerHeight) y = window.innerHeight - rect.height - 4;
      if (x < 0) x = 4;
      if (y < 0) y = 4;
      if (x !== menuPos.x || y !== menuPos.y) {
        setMenuPos({ ...menuPos, x, y });
      }
    });

    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("scroll", close, true);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [menuPos]);

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

  const table = useReactTable({
    data: results,
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

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 20,
  });

  // (D) Cache rows + virtualItems during resize to keep TableBody stable.
  // While a resize drag is in progress, the only thing that changes is
  // column widths — which come from CSS variables, not React props.
  // We freeze the body's input to prevent re-renders.
  const isResizing = !!table.getState().columnSizingInfo.isResizingColumn;
  const cachedRowsRef = useRef(rows);
  const cachedVirtualItemsRef = useRef(virtualizer.getVirtualItems());
  if (!isResizing) {
    cachedRowsRef.current = rows;
    cachedVirtualItemsRef.current = virtualizer.getVirtualItems();
  }

  // Infinite scroll: load more when approaching the bottom
  const handleScroll = useCallback(() => {
    const el = parentRef.current;
    if (!el || loading) return;

    const scrollBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    if (scrollBottom < 500 && results.length < total) {
      loadMore();
    }
  }, [loading, results.length, total, loadMore]);

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
    const orderByChanged = prev.orderBy !== searchParams.orderBy;
    const isSortAction = orderByChanged && searchParams.orderBy != null;
    const nonSortChanged = Object.keys({ ...prev, ...searchParams }).some(
      (key) => key !== "orderBy" && prev[key as keyof typeof prev] !== searchParams[key as keyof typeof searchParams]
    );
    const sortOnly = isSortAction && !nonSortChanged;

    if (!sortOnly) {
      el.scrollTop = 0;
      el.scrollLeft = 0;
    }
  }, [searchParams]);

  // ---------------------------------------------------------------------------
  // Keyboard navigation — matches kahuna's gu-lazy-table-shortcuts
  //
  // Arrow Up/Down: scroll one row (works even when caret is in search box)
  // PageUp/PageDown: scroll one viewport-full of rows (dynamic, based on
  //   how many rows are currently visible — so users never miss a row)
  // Home: jump to top of results
  // End: jump to bottom of loaded results
  //
  // Arrow/Page keys propagate out of the CQL input via its keysToPropagate
  // list, so we handle them in the normal bubble phase.
  //
  // Home/End need special treatment: the CQL input contains a ProseMirror
  // editor inside shadow DOM that would move the cursor on Home/End before
  // our bubble-phase handler fires. We use a **capture-phase** listener
  // on `document` to intercept them before they reach the shadow DOM.
  // This matches kahuna, where `gr-chips` is a contenteditable div and
  // angular-hotkeys fires at the document level before the editor sees
  // the event.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    const el = parentRef.current;
    if (!el) return;

    // Shared helper: compute rows visible in the viewport (excluding sticky header)
    const getRowsPerPage = () => {
      const headerEl = el.querySelector<HTMLElement>("[data-table-header]");
      const headerHeight = headerEl?.offsetHeight ?? 0;
      const viewportRowSpace = el.clientHeight - headerHeight;
      return Math.max(1, Math.floor(viewportRowSpace / ROW_HEIGHT));
    };

    // Bubble-phase handler: arrows + PageUp/PageDown
    // These keys propagate out of the CQL input normally.
    const handleBubble = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowUp":
          e.preventDefault();
          el.scrollTop = Math.max(0, el.scrollTop - ROW_HEIGHT);
          break;
        case "ArrowDown":
          e.preventDefault();
          el.scrollTop = Math.min(
            el.scrollHeight - el.clientHeight,
            el.scrollTop + ROW_HEIGHT
          );
          break;
        case "PageUp":
          e.preventDefault();
          el.scrollTop = Math.max(0, el.scrollTop - getRowsPerPage() * ROW_HEIGHT);
          break;
        case "PageDown":
          e.preventDefault();
          el.scrollTop = Math.min(
            el.scrollHeight - el.clientHeight,
            el.scrollTop + getRowsPerPage() * ROW_HEIGHT
          );
          break;
        default:
          return;
      }
    };

    // Capture-phase handler: Home/End
    // Fires before the event reaches the CQL input's shadow DOM, so
    // preventDefault() stops ProseMirror from also moving the cursor.
    const handleCapture = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Home":
          e.preventDefault();
          el.scrollTop = 0;
          el.scrollLeft = 0;
          break;
        case "End":
          e.preventDefault();
          el.scrollTop = el.scrollHeight - el.clientHeight;
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
  }, []);

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
      setMenuPos({ x: e.clientX, y: e.clientY, columnId });
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

      // Cell values — scan all loaded results
      for (const image of results) {
        const raw = getRawCellValue(colId, image);
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
      setMenuPos(null);
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
    setMenuPos(null);
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
  // Values here are what goes into ?orderBy=... — the ES adapter resolves
  // aliases (e.g. "taken" → "metadata.dateTaken") when building the sort clause.
  //
  // NOTE: TanStack Table replaces dots with underscores in auto-generated column IDs
  // (e.g. accessor "metadata.credit" → column ID "metadata_credit"), so keys here
  // must use underscores to match.
  //
  // text fields without .keyword sub-field (title, description, byline) are NOT sortable.
  const sortableFields: Record<string, string> = {
    metadata_imageType: "metadata.imageType",
    metadata_credit: "metadata.credit",
    metadata_source: "metadata.source",
    metadata_dateTaken: "taken",
    uploadTime: "uploadTime",
    lastModified: "lastModified",
    uploadedBy: "uploadedBy",
    uploadInfo_filename: "uploadInfo.filename",
    width: "source.dimensions.width",
    height: "source.dimensions.height",
    source_mimeType: "source.mimeType",
    usageRights_category: "usageRights.category",
    ...ALIAS_SORTABLE_FIELDS,
  };

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
        rawValue = getRawCellValue(columnId, image);
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
          visibleColumnCount={visibleColIds.length}
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
      {menuPos && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Column options"
          className="fixed popup-menu"
          style={{ left: menuPos.x, top: menuPos.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          {/* Resize actions */}
          {menuPos.columnId && (
            <div
              role="menuitem"
              onClick={() => resizeColumnToFit(menuPos.columnId!)}
              className="popup-item"
            >
              <span className="w-3" />
              Resize column to fit data
            </div>
          )}
          <div
            role="menuitem"
            onClick={resizeAllColumnsToFit}
            className="popup-item"
          >
            <span className="w-3" />
            Resize all columns to fit data
          </div>

          {/* Separator */}
          <div role="separator" className="my-1 border-t border-grid-separator" />

          {/* Column visibility toggles */}
          {allColumns.map((col) => {
            const id = getColumnId(col);
            const label =
              typeof col.header === "string" ? col.header : id;
            const isVisible = !config.hidden.includes(id);
            return (
              <div
                key={id}
                role="menuitemcheckbox"
                aria-checked={isVisible}
                onClick={() => toggleVisibility(id)}
                className="popup-item"
              >
                <span className="w-3 text-center text-grid-accent">
                  {isVisible ? "✓" : ""}
                </span>
                {label}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

