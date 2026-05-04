/**
 * MultiImageMetadata -- metadata panel for when 2+ images are selected.
 *
 * Shows reconciled field values across the selection:
 * - reconcile: all-same shows the value; mixed shows "Multiple X"
 * - chip-array: union of chips; partial (not on every image) chips are hollow
 * - show-if-all-same: row only visible when all images agree
 * - summary-only: computed summary line (e.g. lease count)
 * - always-suppress: excluded from RECONCILE_FIELDS, never reaches this component
 *
 * Selection of exactly 1 image is handled at the route level (renders
 * ImageMetadata verbatim). This component only renders when selectionCount >= 2.
 */

import { useSelectionStore } from "@/stores/selection-store";
import { RECONCILE_FIELDS } from "@/lib/field-registry";
import type { FieldDefinition } from "@/lib/field-registry";
import type { FieldReconciliation } from "@/lib/reconcile";
import {
  groupFieldsIntoSections,
  MetadataSection,
  MetadataRow,
  MetadataBlock,
  ValueLink,
  useMetadataSearch,
  Dash,
} from "./metadata-primitives";
import { MultiSearchPill } from "./SearchPill";
import { MultiValue } from "./MultiValue";

import type { ReconciledView } from "@/lib/reconcile";

// Pre-computed sections (stable reference -- RECONCILE_FIELDS is a module-level constant).
const SECTIONS = groupFieldsIntoSections(RECONCILE_FIELDS);

// ---------------------------------------------------------------------------
// Location composite: collapse the 4 location_* sub-fields into one row.
// ---------------------------------------------------------------------------

const LOCATION_IDS = new Set([
  "location_subLocation",
  "location_city",
  "location_state",
  "location_country",
]);

// Sentinel object representing all 4 location sub-fields as a single row.
// Placed where the first location_* field would appear in each section.
const LOCATION_SENTINEL = { id: "__location__" } as unknown as FieldDefinition;

// Sections with the 4 location_* entries collapsed into one sentinel.
const MULTI_SECTIONS: FieldDefinition[][] = SECTIONS.map((section) => {
  if (!section.some((f) => LOCATION_IDS.has(f.id))) return section;
  const out: FieldDefinition[] = [];
  let inserted = false;
  for (const f of section) {
    if (LOCATION_IDS.has(f.id)) {
      if (!inserted) {
        out.push(LOCATION_SENTINEL);
        inserted = true;
      }
    } else {
      out.push(f);
    }
  }
  return out;
});

// The 4 location sub-fields in display order (same order as field registry).
const LOCATION_FIELDS = RECONCILE_FIELDS.filter((f) => LOCATION_IDS.has(f.id));

function renderLocationGroup(
  reconciledView: ReconciledView | null,
  onSearch: (cqlKey: string, v: string, e: React.MouseEvent) => void,
): React.ReactNode {
  if (!reconciledView) return null;

  // Build one node per non-empty sub-field segment.
  const parts: React.ReactNode[] = [];
  let anyNonEmpty = false;

  for (const field of LOCATION_FIELDS) {
    const rec = reconciledView.get(field.id);
    const kind = rec?.kind ?? "pending";

    if (kind === "all-empty") continue;
    anyNonEmpty = true;

    if (kind === "pending" || kind === "dirty") {
      parts.push(<Dash key={field.id} />);
      continue;
    }
    if (kind === "all-same" && rec.kind === "all-same") {
      const v = typeof rec.value === "string" ? rec.value : String(rec.value);
      parts.push(
        <ValueLink key={field.id} cqlKey={field.cqlKey!} value={v} onSearch={onSearch} />,
      );
      continue;
    }
    if (kind === "mixed" && rec.kind === "mixed") {
      // MultiValue renders "(Multiple cities)" for detailHidden location fields.
      parts.push(<MultiValue key={field.id} field={field} sampleValues={rec.sampleValues} />);
      continue;
    }
  }

  if (!anyNonEmpty && parts.length === 0) return null;

  return (
    <MetadataRow key="__location__" label="Location">
      <span>
        {parts.map((part, i) => (
          <span key={i}>
            {i > 0 && ", "}
            {part}
          </span>
        ))}
      </span>
    </MetadataRow>
  );
}

// ---------------------------------------------------------------------------
// Field value renderer
// ---------------------------------------------------------------------------

function renderScalarAllSame(
  field: FieldDefinition,
  value: unknown,
  onSearch: (cqlKey: string, v: string, e: React.MouseEvent) => void,
): React.ReactNode {
  const displayStr =
    field.formatter
      ? field.formatter(value)
      : typeof value === "string"
        ? value
        : value == null
          ? ""
          : String(value);
  if (!displayStr) return null;

  // Clickable when field has a CQL key and is not explicitly non-clickable.
  if (field.cqlKey && field.detailClickable !== false) {
    // When a formatter is present, the formatter output IS the CQL-friendly
    // value (e.g. formatter("image/jpeg") = "jpeg" = what fileType:jpeg needs).
    // This mirrors single-image FieldValue which uses rawValue for the same purpose.
    const searchStr = field.formatter
      ? displayStr
      : typeof value === "string" ? value : String(value);
    return (
      <ValueLink
        cqlKey={field.cqlKey}
        value={searchStr}
        label={displayStr !== searchStr ? displayStr : undefined}
        onSearch={onSearch}
      />
    );
  }

  // Non-clickable text (dates, description, etc.)
  if (field.detailLayout === "stacked" && field.fieldType === "text") {
    return <span className="whitespace-pre-line">{displayStr}</span>;
  }
  return <span>{displayStr}</span>;
}

// Placeholder for pending / dirty fields (declared below renderScalarAllSame).
function renderField(
  field: FieldDefinition,
  rec: FieldReconciliation | undefined,
  onSearch: (cqlKey: string, v: string, e: React.MouseEvent) => void,
): React.ReactNode {
  // visibleWhen guard (e.g. imageType requires gridConfig.imageTypes to be set).
  if (field.visibleWhen?.() === false) return null;

  const kind = rec?.kind ?? "pending";

  // show-if-all-same: suppress entirely when images disagree.
  if (field.multiSelectBehaviour === "show-if-all-same" && kind !== "all-same") {
    return null;
  }

  // Use stacked layout for text fields with detailLayout=stacked, else inline row.
  const Wrapper =
    field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;

  // ---- chip-array fields -------------------------------------------------
  if (field.multiSelectBehaviour === "chip-array") {
    if (kind === "pending" || kind === "dirty") {
      return (
        <MetadataRow key={field.id} label={field.label}>
          <Dash />
        </MetadataRow>
      );
    }
    if (kind !== "chip-array" || rec.chips.length === 0) return null;
    return (
      <MetadataRow key={field.id} label={field.label}>
        <div className="flex flex-wrap gap-1 pt-0.5">
          {rec.chips
            .slice()
            .sort((a, b) => b.count - a.count)
            .map((chip) => (
              <MultiSearchPill
                key={chip.value}
                value={chip.value}
                cqlKey={field.cqlKey!}
                count={chip.count}
                total={rec.total}
                partial={chip.count < rec.total}
                accent={field.pillVariant === "accent"}
                onSearch={onSearch}
              />
            ))}
        </div>
      </MetadataRow>
    );
  }

  // ---- summary-only fields -----------------------------------------------
  if (field.multiSelectBehaviour === "summary-only") {
    if (kind === "pending" || kind === "dirty") {
      return (
        <MetadataRow key={field.id} label={field.label}>
          <Dash />
        </MetadataRow>
      );
    }
    if (kind !== "summary") return null;
    return (
      <MetadataRow key={field.id} label={field.label}>
        {rec.line}
      </MetadataRow>
    );
  }

  // ---- scalar fields (reconcile + show-if-all-same) ----------------------
  if (kind === "pending" || kind === "dirty") {
    return (
      <Wrapper key={field.id} label={field.label}>
        <Dash />
      </Wrapper>
    );
  }

  if (kind === "all-empty") {
    if (!field.showWhenEmpty) return null;
    return (
      <Wrapper key={field.id} label={field.label}>
        <Dash />
      </Wrapper>
    );
  }

  if (kind === "mixed") {
    return (
      <Wrapper key={field.id} label={field.label}>
        <MultiValue field={field} sampleValues={rec.sampleValues} />
      </Wrapper>
    );
  }

  if (kind === "all-same") {
    const content = renderScalarAllSame(field, rec.value, onSearch);
    if (!content) return null;
    return (
      <Wrapper key={field.id} label={field.label}>
        {content}
      </Wrapper>
    );
  }

  return null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MultiImageMetadata() {
  const reconciledView = useSelectionStore((s) => s.reconciledView);
  const onSearch = useMetadataSearch();

  return (
    <dl>
      {MULTI_SECTIONS.map((sectionFields, si) => (
        <MetadataSection key={si}>
          {sectionFields.map((field) =>
            field.id === "__location__"
              ? renderLocationGroup(reconciledView, onSearch)
              : renderField(field, reconciledView?.get(field.id), onSearch),
          )}
        </MetadataSection>
      ))}
    </dl>
  );
}
