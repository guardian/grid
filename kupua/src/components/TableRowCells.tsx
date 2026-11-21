import { memo, useEffect, useRef } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import type { Image } from "@/types/image";
import type { EnrichedImage } from "@/lib/derive-enriched-image";
import { COLUMN_CQL_KEYS, FIELDS_BY_ID, type FieldDefinition } from "@/lib/field-registry";
import { getThumbnailUrl } from "@/lib/image-urls";
import { DataSearchPill } from "./SearchPill";

export function TableThumbnail({ image }: { image: Image }) {
  const url = getThumbnailUrl(image);
  const thumbnailRef = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const thumbnail = thumbnailRef.current;
    return () => {
      if (thumbnail && !thumbnail.isConnected && !thumbnail.complete) {
        thumbnail.removeAttribute("src");
      }
    };
  }, [url]);
  return url ? <img ref={thumbnailRef} src={url} alt="" loading="lazy" className="h-7 w-auto object-contain"
    onError={event => { event.currentTarget.style.display = "none"; }} /> : null;
}

export function renderTableField(field: FieldDefinition, image: Image,
  value: ReturnType<FieldDefinition["accessor"]>, enriched?: EnrichedImage) {
  if (field.cellRenderer && enriched) return field.cellRenderer(enriched);
  if (field.isList) {
    if (!Array.isArray(value) || value.length === 0) return "—";
    return <span className="inline-flex flex-nowrap gap-0.5 overflow-hidden" style={{ contain: "layout" }}>
      {value.map((item, index) => <DataSearchPill key={index} cqlKey={field.cqlKey!}
        value={item} accent={field.pillVariant === "accent"} />)}
    </span>;
  }
  if (field.isComposite) {
    const parts = (field.subFields ?? []).map(part => ({ key: part.cqlKey, value: part.accessor(image) }))
      .filter((part): part is { key: string; value: string } => part.value != null);
    if (parts.length === 0) return "—";
    return <>{parts.map((part, index) => <span key={part.key}>
      {index > 0 && <span className="text-grid-text-dim">, </span>}
      <span data-cql-key={part.key} data-cql-value={part.value}
        className="hover:underline hover:text-grid-accent cursor-pointer">{part.value}</span>
    </span>)}</>;
  }
  const display = Array.isArray(value) ? value.join(", ") : value;
  return display ? field.formatter ? field.formatter(display) : display : "—";
}

interface TableRowCellsProps {
  image: Image;
  columns: readonly ColumnDef<Image, any>[];
  enriched: EnrichedImage | undefined;
  handleCellClick: (columnId: string, image: Image, event: React.MouseEvent) => void;
}

export const TableRowCells = memo(function TableRowCells({ image, columns, enriched, handleCellClick }: TableRowCellsProps) {
  return <>{columns.map(column => {
    const columnId = column.id!;
    const field = FIELDS_BY_ID.get(columnId);
    const value = field?.accessor(image);
    const rawValue = field?.rawValue ? field.rawValue(image) : Array.isArray(value) ? value.join(", ") : value;
    const isClickable = columnId in COLUMN_CQL_KEYS || columnId === "location" || columnId === "subjects" || columnId === "people";
    const content = columnId === "thumbnail" ? <TableThumbnail image={image} />
      : field ? renderTableField(field, image, value, enriched) : null;
    return <div key={columnId} role="gridcell" data-cql-cell={isClickable ? "" : undefined}
      className="flex items-center shrink-0 px-2 text-xs text-grid-text truncate border-r border-grid-separator/20 overflow-hidden"
      style={{ width: `var(--col-${columnId})`, contain: "layout" }} title={rawValue ?? undefined}
      onMouseDown={isClickable ? event => { if (event.shiftKey || event.altKey) event.preventDefault(); } : undefined}
      onClick={isClickable ? event => handleCellClick(columnId, image, event) : undefined}>{content}</div>;
  })}</>;
});