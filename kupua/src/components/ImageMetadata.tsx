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
 * Display rules replicate kahuna's layout:
 *   - Sections separated by solid #565656 dividers (kahuna's image-info__group
 *     border-bottom: 1px solid #565656) — these are orientation landmarks
 *   - Title, Description, Special instructions are STACKED (label above value,
 *     not side-by-side) — matching kahuna's image-info__wrap block flow
 *   - Most other fields are INLINE (key 30% left, value 70% right) — matching
 *     kahuna's image-info__group--dl__key--panel / __value--panel pattern
 *   - Labels are bold (kahuna's .metadata-line__key { font-weight: bold })
 *   - Clickable values have a persistent underline (kahuna's
 *     .metadata-line__info a { border-bottom: 1px solid #999 })
 *   - Values are clickable search links (click = search, Shift = AND, Alt = exclude)
 *   - Empty fields are hidden (no editors in Phase 2)
 *   - Location sub-parts are individual search links
 *   - List fields (keywords, subjects, people) are rendered as search pills
 *   - Section padding ~10px (py-2.5) matches kahuna's image-info__group padding
 *
 * See kupua/exploration/docs/metadata-display-plan.md for the full design.
 */

import { useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { cancelSearchDebounce } from "@/components/SearchBar";
import { upsertFieldTerm } from "@/lib/cql-query-edit";
import { ALT_CLICK } from "@/lib/keyboard-shortcuts";
import { format } from "date-fns";
import type { Image, ImageMetadata as ImageMetadataType } from "@/types/image";
import { SearchPill } from "./SearchPill";

// ---------------------------------------------------------------------------
// Formatters
// ---------------------------------------------------------------------------

function formatDetailDate(dateStr?: string): string {
  if (!dateStr) return "";
  try {
    return format(new Date(dateStr), "d MMM yyyy, HH:mm");
  } catch {
    return dateStr;
  }
}

function formatFileSize(bytes?: number): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDimensions(image: Image): string {
  const dims = image.source.orientedDimensions ?? image.source.dimensions;
  if (!dims) return "";
  return `${dims.width} × ${dims.height}`;
}

// ---------------------------------------------------------------------------
// Location sub-parts — for individual search links
// ---------------------------------------------------------------------------

const LOCATION_PARTS: { key: keyof ImageMetadataType; cqlKey: string }[] = [
  { key: "subLocation", cqlKey: "location" },
  { key: "city", cqlKey: "city" },
  { key: "state", cqlKey: "state" },
  { key: "country", cqlKey: "country" },
];

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
// ImageMetadata — the full metadata display
// ---------------------------------------------------------------------------

interface ImageMetadataProps {
  image: Image;
}

export function ImageMetadata({ image }: ImageMetadataProps) {
  const m = image.metadata;
  const onSearch = useMetadataSearch();
  const dims = formatDimensions(image);
  const fileSize = formatFileSize(image.source.size);
  const dateTaken = formatDetailDate(m.dateTaken);
  const uploaded = formatDetailDate(image.uploadTime);
  const fileType = image.source.mimeType?.replace("image/", "");

  // Location parts that have values
  const locationParts = LOCATION_PARTS
    .map((lp) => ({ ...lp, value: m[lp.key] as string | undefined }))
    .filter((lp) => lp.value);

  return (
    <dl>
      {/* --- Rights & restrictions (kahuna: first group) --- */}
      <MetadataSection>
        {image.usageRights?.category && (
          <MetadataRow label="Category">
            <span>{image.usageRights.category}</span>
          </MetadataRow>
        )}

        {m.imageType && (
          <MetadataRow label="Image type">
            <span>{m.imageType}</span>
          </MetadataRow>
        )}
      </MetadataSection>

      {/* --- Title & Description (stacked, kahuna: own group) --- */}
      <MetadataSection>
        {m.title && (
          <MetadataBlock label="Title">
            <ValueLink cqlKey="title" value={m.title} onSearch={onSearch} />
          </MetadataBlock>
        )}

        {m.description && (
          <MetadataBlock label="Description">
            <span className="whitespace-pre-line">{m.description}</span>
          </MetadataBlock>
        )}
      </MetadataSection>

      {/* --- Special instructions (stacked, kahuna: own group) --- */}
      <MetadataSection>
        {m.specialInstructions && (
          <MetadataBlock label="Special instructions">
            <span className="whitespace-pre-line">{m.specialInstructions}</span>
          </MetadataBlock>
        )}
      </MetadataSection>

      {/* --- Core metadata (kahuna: big inline group) --- */}
      <MetadataSection>
        {dateTaken && (
          <MetadataRow label="Taken on">
            <span>{dateTaken}</span>
          </MetadataRow>
        )}

        {m.byline && (
          <MetadataRow label="By">
            <ValueLink cqlKey="by" value={m.byline} onSearch={onSearch} />
          </MetadataRow>
        )}

        {m.credit && (
          <MetadataRow label="Credit">
            <ValueLink cqlKey="credit" value={m.credit} onSearch={onSearch} />
          </MetadataRow>
        )}

        {locationParts.length > 0 && (
          <MetadataRow label="Location">
            <span>
              {locationParts.map((lp, i) => (
                <span key={lp.key}>
                  {i > 0 && ", "}
                  <ValueLink cqlKey={lp.cqlKey} value={lp.value!} onSearch={onSearch} />
                </span>
              ))}
            </span>
          </MetadataRow>
        )}

        {m.copyright && (
          <MetadataRow label="Copyright">
            <ValueLink cqlKey="copyright" value={m.copyright} onSearch={onSearch} />
          </MetadataRow>
        )}

        {m.source && (
          <MetadataRow label="Source">
            <ValueLink cqlKey="source" value={m.source} onSearch={onSearch} />
          </MetadataRow>
        )}

        {uploaded && (
          <MetadataRow label="Uploaded">
            <span>{uploaded}</span>
          </MetadataRow>
        )}

        {image.uploadedBy && (
          <MetadataRow label="Uploader">
            <ValueLink cqlKey="uploader" value={image.uploadedBy} onSearch={onSearch} />
          </MetadataRow>
        )}

        {m.suppliersReference && (
          <MetadataRow label="Supplier ref">
            <span>{m.suppliersReference}</span>
          </MetadataRow>
        )}

        {m.subjects && m.subjects.length > 0 && (
          <MetadataRow label="Subjects">
            <div className="flex flex-wrap gap-1">
              {m.subjects.map((s) => (
                <SearchPill key={s} cqlKey="subject" value={s} onSearch={onSearch} />
              ))}
            </div>
          </MetadataRow>
        )}

        {m.peopleInImage && m.peopleInImage.length > 0 && (
          <MetadataRow label="People">
            <div className="flex flex-wrap gap-1">
              {m.peopleInImage.map((p) => (
                <SearchPill key={p} cqlKey="person" value={p} onSearch={onSearch} />
              ))}
            </div>
          </MetadataRow>
        )}
      </MetadataSection>

      {/* --- Keywords (kahuna: own group) --- */}
      <MetadataSection>
        {m.keywords && m.keywords.length > 0 && (
          <MetadataBlock label="Keywords">
            <div className="flex flex-wrap gap-1 pt-0.5">
              {m.keywords.map((k) => (
                <SearchPill key={k} cqlKey="keyword" value={k} onSearch={onSearch} />
              ))}
            </div>
          </MetadataBlock>
        )}
      </MetadataSection>

      {/* --- Technical info --- */}
      <MetadataSection>
        {dims && (
          <MetadataRow label="Dimensions">
            <span>{dims}</span>
          </MetadataRow>
        )}

        {fileSize && (
          <MetadataRow label="File size">
            <span>{fileSize}</span>
          </MetadataRow>
        )}

        {fileType && (
          <MetadataRow label="File type">
            <span>{fileType}</span>
          </MetadataRow>
        )}
      </MetadataSection>

      {/* --- Identity (always shown) --- */}
      <MetadataSection>
        <MetadataRow label="Image ID">
          <span className="select-all font-mono text-2xs">{image.id}</span>
        </MetadataRow>
      </MetadataSection>
    </dl>
  );
}

