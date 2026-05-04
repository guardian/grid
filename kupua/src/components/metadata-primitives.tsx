/**
 * Shared metadata display primitives used by both ImageMetadata (single-image)
 * and MultiImageMetadata (multi-select panel).
 *
 * Exported: useMetadataSearch, ValueLink, MetadataSection, MetadataRow,
 *           MetadataBlock, FieldValue, groupFieldsIntoSections.
 *
 * These components carry no knowledge of selection state -- they only handle
 * layout, interactivity, and field-value rendering for known (non-null) values.
 */

import { useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { cancelSearchDebounce } from "@/lib/orchestration/search";
import { upsertFieldTerm } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { ALT_CLICK } from "@/lib/keyboard-shortcuts";
import { trace } from "@/lib/perceived-trace";
import type { Image } from "@/types/image";
import { SearchPill } from "./SearchPill";
import type { FieldDefinition } from "@/lib/field-registry";

// ---------------------------------------------------------------------------
// useMetadataSearch -- hook for click-to-search on metadata values.
// Click replaces query, Shift+click appends (AND), Alt+click excludes (NOT).
// Matches ImageTable cell click and FacetFilters click patterns.
// ---------------------------------------------------------------------------

export function useMetadataSearch() {
  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();

  return useCallback(
    (cqlKey: string, value: string, e: React.MouseEvent) => {
      trace("metadata-click", "t_0", { field: cqlKey, value });
      e.preventDefault();
      const currentQuery = searchParams.query ?? "";
      const negated = e.altKey;

      let newQuery: string;
      if (e.shiftKey || e.altKey) {
        // Shift = append, Alt = exclude (append negated)
        newQuery = upsertFieldTerm(currentQuery, cqlKey, value, negated);
      } else {
        // Plain click = replace query entirely
        newQuery = `${cqlKey}:${value.includes(" ") ? `"${value}"` : value}`;
      }

      if (newQuery !== currentQuery) {
        cancelSearchDebounce(newQuery);
      }
      // Always strip `image` param so the user returns to the search
      // results list -- even if the query is unchanged.
      updateSearch({ query: newQuery || undefined, image: undefined });
    },
    [searchParams.query, updateSearch],
  );
}

// ---------------------------------------------------------------------------
// ValueLink -- a clickable value that launches a search.
// Persistent underline replicates kahuna's .metadata-line__info a
// { color: inherit; border-bottom: 1px solid #999 }.
// ---------------------------------------------------------------------------

export interface ValueLinkProps {
  cqlKey: string;
  value: string;
  /** Display text; defaults to `value` when omitted. */
  label?: string;
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
  className?: string;
}

export function ValueLink({ cqlKey, value, label, onSearch, className }: ValueLinkProps) {
  const display = label ?? value;
  return (
    <button
      type="button"
      className={`text-grid-text underline decoration-[#999] underline-offset-2 hover:text-grid-accent hover:decoration-grid-accent cursor-pointer bg-transparent border-none p-0 font-inherit text-left ${className ?? ""}`}
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${display}\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {display}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MetadataSection -- groups fields with a solid divider line between sections.
// Replicates kahuna's `image-info__group` (padding: 10px; border-bottom:
// 1px solid #565656). These dividers are orientation landmarks.
// Renders nothing if all children are falsy (conditional fields all hidden).
// ---------------------------------------------------------------------------

interface MetadataSectionProps {
  children: React.ReactNode;
}

export function MetadataSection({ children }: MetadataSectionProps) {
  // Filter out falsy children (from conditional renders)
  const validChildren = Array.isArray(children)
    ? children.filter(Boolean)
    : children
      ? [children]
      : [];
  if (validChildren.length === 0) return null;
  return (
    <div className="py-2.5 border-b border-grid-separator last:border-b-0">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetadataRow -- single key-value pair, INLINE layout (key left 30%, value
// right 70%). Matches kahuna's image-info__group--dl__key--panel / __value--panel.
// Used for most fields (By, Credit, Location, Taken on, etc.)
// ---------------------------------------------------------------------------

export interface MetadataRowProps {
  label: string;
  children: React.ReactNode;
}

export function MetadataRow({ label, children }: MetadataRowProps) {
  return (
    <div className="flex gap-1 py-0.75 leading-snug">
      <dt className="text-xs font-bold text-grid-text-dim shrink-0 w-[30%]">
        {label}
      </dt>
      <dd className="text-xs text-grid-text wrap-break-word min-w-0">
        {children}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MetadataBlock -- stacked layout: label on top, value below.
// Used for Title, Description, Special instructions -- these fields have
// longer values where a side-by-side layout wastes space. Matches kahuna's
// image-info__wrap pattern where <dt> and <dd> are in normal block flow.
// ---------------------------------------------------------------------------

export interface MetadataBlockProps {
  label: string;
  children: React.ReactNode;
}

export function MetadataBlock({ label, children }: MetadataBlockProps) {
  return (
    <div className="py-0.75 leading-snug">
      <dt className="text-xs font-bold text-grid-text-dim pb-0.5">
        {label}
      </dt>
      <dd className="text-xs text-grid-text wrap-break-word">
        {children}
      </dd>
    </div>
  );
}

// ---------------------------------------------------------------------------
// FieldValue -- renders a single field's value with appropriate interactivity.
// Handles plain text, clickable values, lists (pills), composites (location),
// and special cases (Image ID with monospace + select-all).
// Used by ImageMetadata (single-image) and by MultiImageMetadata for the
// all-same case (where the reconciled value is shown verbatim).
// ---------------------------------------------------------------------------

export function FieldValue({
  field,
  image,
  onSearch,
}: {
  field: FieldDefinition;
  image: Image;
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}) {
  // Image ID -- special rendering: monospace, select-all, no click-to-search
  if (field.id === "imageId") {
    return <span className="select-all font-mono text-2xs">{image.id}</span>;
  }

  // Composite field (location) -- each sub-field is a separate search link
  if (field.isComposite && field.subFields) {
    const parts = field.subFields
      .map((sf) => ({ cqlKey: sf.cqlKey, value: sf.accessor(image) }))
      .filter((p): p is { cqlKey: string; value: string } => p.value != null);
    if (parts.length === 0) return null;
    return (
      <span>
        {parts.map((p, i) => (
          <span key={p.cqlKey}>
            {i > 0 && ", "}
            <ValueLink cqlKey={p.cqlKey} value={p.value} onSearch={onSearch} />
          </span>
        ))}
      </span>
    );
  }

  // List field -- render as search pills
  if (field.isList) {
    const values = field.accessor(image);
    if (!Array.isArray(values) || values.length === 0) return null;
    const accent = field.pillVariant === "accent";
    return (
      <div className="flex flex-wrap gap-1 pt-0.5">
        {values.map((v) => (
          <SearchPill key={v} cqlKey={field.cqlKey!} value={v} onSearch={onSearch} accent={accent} />
        ))}
      </div>
    );
  }

  // Scalar field
  const raw = field.accessor(image);
  if (raw == null || raw === "") return null;
  const displayValue = typeof raw === "string" && field.formatter
    ? field.formatter(raw)
    : typeof raw === "string" ? raw : String(raw);

  // Clickable if it has a cqlKey and detailClickable is not explicitly false
  if (field.cqlKey && field.detailClickable !== false) {
    // Use rawValue (stripped/normalised) for search if available, else accessor value.
    // e.g. fileType: rawValue="jpeg", accessor="image/jpeg" -- search needs "jpeg".
    const searchValue = field.rawValue?.(image) ?? (typeof raw === "string" ? raw : String(raw));
    if (!searchValue) return null;
    return (
      <ValueLink cqlKey={field.cqlKey} value={searchValue} onSearch={onSearch} />
    );
  }

  // Non-clickable plain text
  // Stacked text fields get whitespace-pre-line for multi-line values
  if (field.detailLayout === "stacked" && field.fieldType === "text") {
    return <span className="whitespace-pre-line">{displayValue}</span>;
  }

  return <span>{displayValue}</span>;
}

// ---------------------------------------------------------------------------
// Dash -- placeholder for empty-but-important fields.
// "Empty" rather than "--" or "Unknown" -- the value is absent, not unknown.
// ---------------------------------------------------------------------------

export function Dash() {
  return <span className="text-grid-text-dim/50 select-none">Empty</span>;
}

// ---------------------------------------------------------------------------
// groupFieldsIntoSections -- split a flat field list into section arrays
// ---------------------------------------------------------------------------

export function groupFieldsIntoSections(fields: readonly FieldDefinition[]): FieldDefinition[][] {
  const sections: FieldDefinition[][] = [];
  let currentGroup: string | null = null;
  let currentSection: FieldDefinition[] = [];

  for (const field of fields) {
    const effectiveGroup = field.detailGroup ?? field.group;
    if (effectiveGroup !== currentGroup) {
      if (currentSection.length > 0) sections.push(currentSection);
      currentSection = [];
      currentGroup = effectiveGroup;
    }
    currentSection.push(field);
  }
  if (currentSection.length > 0) sections.push(currentSection);
  return sections;
}
