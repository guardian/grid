/**
 * ImageMetadata — shared metadata display for an image.
 *
 * Used in two contexts:
 *   1. ImageDetail sidebar (single-image view)
 *   2. Right side panel in grid/table view (shows focused image's metadata)
 *
 * Takes an Image and renders a definition list of its metadata fields.
 * No layout chrome (no <aside>, no width, no border) — callers handle
 * their own container styling.
 *
 * Field order, layout (stacked vs inline), and visibility are all driven
 * by the field registry (DETAIL_PANEL_FIELDS). Section breaks are inserted
 * whenever the `group` changes between consecutive fields.
 *
 * Display rules replicate kahuna's layout:
 *   - Sections separated by solid #565656 dividers (kahuna's image-info__group
 *     border-bottom: 1px solid #565656) — these are orientation landmarks
 *   - Fields with detailLayout: "stacked" render label above value
 *   - All other fields render INLINE (key 30% left, value 70% right)
 *   - Labels are bold (kahuna's .metadata-line__key { font-weight: bold })
 *   - Clickable values have a persistent underline (kahuna's
 *     .metadata-line__info a { border-bottom: 1px solid #999 })
 *   - Values are clickable search links (click = search, Shift = AND, Alt = exclude)
 *   - Empty fields are hidden (no editors in Phase 2)
 *   - Location sub-parts are individual search links
 *   - List fields (keywords, subjects, people) are rendered as search pills
 *   - Section padding ~10px (py-2.5) matches kahuna's image-info__group padding
 *
 * See kupua/exploration/docs/zz Archive/metadata-display-plan.md for the full design.
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
import {
  DETAIL_PANEL_FIELDS,
  type FieldDefinition,
} from "@/lib/field-registry";

// ---------------------------------------------------------------------------
// useMetadataSearch — hook for click-to-search on metadata values.
// Click replaces query, Shift+click appends (AND), Alt+click excludes (NOT).
// Matches ImageTable cell click and FacetFilters click patterns.
// ---------------------------------------------------------------------------

function useMetadataSearch() {
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
      // results list — even if the query is unchanged (e.g. clicking the
      // same byline from a second image). In list/panel context `image`
      // is already absent (no-op).
      // Metadata click-to-search: single push combining new query + close
      // detail (image: undefined). Splitting into two pushes would insert a
      // redundant [list@old-query] entry the user never asked to visit.
      // The old-query list is reachable one further back from the detail
      // entry anyway.
      updateSearch({ query: newQuery || undefined, image: undefined });
    },
    [searchParams.query, updateSearch],
  );
}

// ---------------------------------------------------------------------------
// ValueLink — a clickable value that launches a search.
// Persistent underline replicates kahuna's .metadata-line__info a
// { color: inherit; border-bottom: 1px solid #999 }.
// ---------------------------------------------------------------------------

interface ValueLinkProps {
  cqlKey: string;
  value: string;
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
  className?: string;
}

function ValueLink({ cqlKey, value, onSearch, className }: ValueLinkProps) {
  return (
    <button
      type="button"
      className={`text-grid-text underline decoration-[#999] underline-offset-2 hover:text-grid-accent hover:decoration-grid-accent cursor-pointer bg-transparent border-none p-0 font-inherit text-left ${className ?? ""}`}
      onClick={(e) => onSearch(cqlKey, value, e)}
      title={`${value}\nShift+click to add, ${ALT_CLICK} to exclude`}
    >
      {value}
    </button>
  );
}

// ---------------------------------------------------------------------------
// MetadataSection — groups fields with a solid divider line between sections.
// Replicates kahuna's `image-info__group` (padding: 10px; border-bottom:
// 1px solid #565656). These dividers are orientation landmarks — they let
// users know where they are in the panel without reading labels.
// Renders nothing if all children are falsy (conditional fields all hidden).
// ---------------------------------------------------------------------------

interface MetadataSectionProps {
  children: React.ReactNode;
}

function MetadataSection({ children }: MetadataSectionProps) {
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
// MetadataRow — single key-value pair, INLINE layout (key left 30%, value
// right 70%). Matches kahuna's image-info__group--dl__key--panel / __value--panel.
// Used for most fields (By, Credit, Location, Taken on, etc.)
// ---------------------------------------------------------------------------

interface MetadataRowProps {
  label: string;
  children: React.ReactNode;
}

function MetadataRow({ label, children }: MetadataRowProps) {
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
// MetadataBlock — stacked layout: label on top, value below.
// Used for Title, Description, Special instructions — these fields have
// longer values where a side-by-side layout wastes space. Matches kahuna's
// image-info__wrap pattern where <dt> and <dd> are in normal block flow.
// ---------------------------------------------------------------------------

interface MetadataBlockProps {
  label: string;
  children: React.ReactNode;
}

function MetadataBlock({ label, children }: MetadataBlockProps) {
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
// FieldValue — renders a single field's value with appropriate interactivity.
// Handles plain text, clickable values, lists (pills), composites (location),
// and special cases (Image ID with monospace + select-all).
// ---------------------------------------------------------------------------

function FieldValue({
  field,
  image,
  onSearch,
}: {
  field: FieldDefinition;
  image: Image;
  onSearch: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}) {
  // Image ID — special rendering: monospace, select-all, no click-to-search
  if (field.id === "imageId") {
    return <span className="select-all font-mono text-2xs">{image.id}</span>;
  }

  // Composite field (location) — each sub-field is a separate search link
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

  // List field — render as search pills
  if (field.isList) {
    const values = field.accessor(image);
    if (!Array.isArray(values) || values.length === 0) return null;
    return (
      <div className="flex flex-wrap gap-1 pt-0.5">
        {values.map((v) => (
          <SearchPill key={v} cqlKey={field.cqlKey!} value={v} onSearch={onSearch} />
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
    // e.g. fileType: rawValue="jpeg", accessor="image/jpeg" — search needs "jpeg".
    const searchValue = field.rawValue?.(image) ?? (typeof raw === "string" ? raw : String(raw));
    if (!searchValue) return null;
    // Show the display-formatted text but use the search-friendly value for the CQL query
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
// Group the flat field list into sections (split on group change)
// ---------------------------------------------------------------------------

function groupFieldsIntoSections(fields: readonly FieldDefinition[]): FieldDefinition[][] {
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

const SECTIONS = groupFieldsIntoSections(DETAIL_PANEL_FIELDS);

// ---------------------------------------------------------------------------
// ImageMetadata — the full metadata display, driven by the field registry
// ---------------------------------------------------------------------------

interface ImageMetadataProps {
  image: Image;
}

export function ImageMetadata({ image }: ImageMetadataProps) {
  const onSearch = useMetadataSearch();

  return (
    <dl>
      {SECTIONS.map((section, sIdx) => (
        <MetadataSection key={sIdx}>
          {section.map((field) => {
            // Check if the field has a value for this image
            const raw = field.accessor(image);
            const hasValue = field.id === "imageId" // always show
              || (Array.isArray(raw) ? raw.length > 0 : raw != null && raw !== "");
            if (!hasValue) return null;

            const Layout = field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;
            return (
              <Layout key={field.id} label={field.label}>
                <FieldValue field={field} image={image} onSearch={onSearch} />
              </Layout>
            );
          })}
        </MetadataSection>
      ))}
    </dl>
  );
}

