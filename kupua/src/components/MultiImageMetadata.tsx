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
import type { FieldReconciliation, ReconciledView } from "@/lib/reconcile";
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
import { isLeaseActive } from "@/lib/syndication/calculate-syndication-status";
import { deriveImage } from "@/lib/derive-enriched-image";
import { categoryLabel } from "@/lib/category-labels";
import { useEnrichmentStore } from "@/stores/enrichment-store";
import type { Cost } from "@/dal/grid-api/types";


// Pre-computed sections (stable reference -- RECONCILE_FIELDS is a module-level constant).
const SECTIONS = groupFieldsIntoSections(RECONCILE_FIELDS);

const LOCATION_IDS = new Set([
  "location_subLocation",
  "location_city",
  "location_state",
  "location_country",
]);

// Sentinel object representing all 4 location sub-fields as a single row.
// Placed where the first location_* field would appear in each section.
const LOCATION_SENTINEL = { id: "__location__" } as unknown as FieldDefinition;

// Sections with the 4 location_* entries collapsed into one sentinel,
// and usageRights_category excluded (rendered explicitly in Rights section).
const MULTI_SECTIONS: FieldDefinition[][] = SECTIONS.map((section) => {
  const filtered = section.filter((f) => f.id !== "usageRights_category");
  if (!filtered.some((f) => LOCATION_IDS.has(f.id))) return filtered;
  const out: FieldDefinition[] = [];
  let inserted = false;
  for (const f of filtered) {
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
  total: number,
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
    if (rec?.kind === "all-same") {
      const v = typeof rec.value === "string" ? rec.value : String(rec.value);
      parts.push(
        <ValueLink key={field.id} cqlKey={field.cqlKey!} value={v} onSearch={onSearch} />,
      );
      continue;
    }
    if (rec?.kind === "mixed") {
      // MultiValue renders "(Multiple cities)" for detailHidden location fields.
      parts.push(<MultiValue key={field.id} field={field} topValues={rec.topValues} total={total} />);
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
      ? field.formatter(value as string)
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
  total: number,
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
    if (!rec || rec.kind !== "chip-array" || rec.chips.length === 0) return null;
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
    if (!rec || rec.kind !== "summary") return null;
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

  if (rec?.kind === "mixed") {
    return (
      <Wrapper key={field.id} label={field.label}>
        <MultiValue field={field} topValues={rec.topValues} total={total} />
      </Wrapper>
    );
  }

  if (rec?.kind === "all-same") {
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
// Cost summary section — aggregate cost buckets across selection
// ---------------------------------------------------------------------------

const COST_ORDER: Array<Cost | "no-rights"> = ["free", "conditional", "pay", "overquota", "no-rights"];
// Labels match Kahuna: count-first, user-facing wording.
const COST_LABEL: Record<Cost | "no-rights", string> = {
  free: "free",
  conditional: "restricted",
  pay: "paid",
  overquota: "over quota",
  "no-rights": "no rights",
};
// Base colour for each bucket's pill (Kahuna: free=green, conditional=orange, pay/no_rights/overquota=red)
const COST_COLOR: Record<Cost | "no-rights", string> = {
  free: "green",
  conditional: "orange",
  pay: "red",
  overquota: "red",
  "no-rights": "red",
};
// Kahuna only shows lease-fraction gradient on these buckets.
// free is always solid green; no-rights is always solid red (lease doesn't fix missing rights).
const LEASE_GRADIENT_BUCKETS = new Set<Cost | "no-rights">(["pay", "overquota", "conditional"]);

function CostSummarySection() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const metadataCache = useSelectionStore((s) => s.metadataCache);
  const enrichmentData = useEnrichmentStore((s) => s.data);

  // Aggregate: count per cost bucket
  const counts = new Map<Cost | "no-rights", number>();
  const leasedCounts = new Map<Cost | "no-rights", number>();

  for (const id of selectedIds) {
    const img = metadataCache.get(id);
    if (!img) continue;
    const enriched = deriveImage(img, enrichmentData.get(id));
    const bucket: Cost | "no-rights" = enriched.noRights
      ? "no-rights"
      : enriched.cost;
    counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
    // Leased if any allow-use lease is active (from enrichment summary)
    if (enriched.leasesSummary?.hasActiveAllowLease) {
      leasedCounts.set(bucket, (leasedCounts.get(bucket) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return null;

  // Full-width blocks breaking out of parent p-3 padding (same negative-margin
  // pattern as validity/restrictions banners in ImageMetadata).
  return (
    <div className="-mx-3 -mt-3 mb-2 flex flex-wrap gap-1 p-1">
      {COST_ORDER.filter((b) => counts.has(b)).map((bucket) => {
        const count = counts.get(bucket)!;
        const leased = leasedCounts.get(bucket) ?? 0;
        const baseColor = COST_COLOR[bucket];
        const showGradient = LEASE_GRADIENT_BUCKETS.has(bucket) && leased > 0;
        const pct = showGradient ? Math.round(100 * leased / count) : 0;
        const bg =
          showGradient && leased < count
            ? `linear-gradient(90deg, teal 0 ${pct}%, ${baseColor} ${pct}% 100%)`
            : showGradient && leased === count
              ? "teal"
              : baseColor;
        return (
          <div
            key={bucket}
            className="px-3 py-1.5 text-center text-xs font-semibold text-white whitespace-nowrap"
            style={{ background: bg }}
            title={showGradient ? `${leased} of ${count} leased` : undefined}
          >
            {count} {COST_LABEL[bucket]}
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Lease type row — compact card row for multi-image lease summary.
// Left coloured border matches single-image lease cards; count right-aligned.
// deny → red, allow → teal; "All" is bold + coloured to stand out from counts.
// ---------------------------------------------------------------------------

const LEASE_ROW_ORDER: { key: string; access: string; label: string; isAllow: boolean; state: "active" | "pending" }[] = [
  { key: "deny-use-active", access: "deny-use", label: "Deny use", isAllow: false, state: "active" },
  { key: "deny-use-pending", access: "deny-use", label: "Deny use (pending)", isAllow: false, state: "pending" },
  { key: "allow-use-active", access: "allow-use", label: "Allow use", isAllow: true, state: "active" },
  { key: "allow-use-pending", access: "allow-use", label: "Allow use (pending)", isAllow: true, state: "pending" },
  { key: "deny-syndication-active", access: "deny-syndication", label: "Deny syndication", isAllow: false, state: "active" },
  // deny-syndication can't be pending (no startDate by design)
  { key: "allow-syndication-active", access: "allow-syndication", label: "Allow syndication", isAllow: true, state: "active" },
  { key: "allow-syndication-pending", access: "allow-syndication", label: "Allow syndication (pending)", isAllow: true, state: "pending" },
];

function LeaseTypeRow({ label, count, total, isAllow }: { label: string; count: number; total: number; isAllow: boolean }) {
  if (count === 0) return null;
  const isAll = count >= total;
  return (
    <div className={`flex items-baseline justify-between text-2xs border-l-[3px] ${isAllow ? "border-[teal]" : "border-[red]"} pl-1.5 py-0.5`}>
      <span className={`text-grid-text ${isAll ? "font-bold" : ""}`}>{label}</span>
      <span className={`text-grid-text ${isAll ? "font-bold" : ""} tabular-nums`}>
        {isAll ? "All images" : `${count} of ${total}`}{" "}
        <span className={`inline-block w-3 text-center ${isAllow ? "text-[teal]" : "text-[red]"}`}>{isAll ? "●" : "◐"}</span>
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Rights & leases section
// ---------------------------------------------------------------------------

function RightsAndLeasesSection() {
  const reconciledView = useSelectionStore((s) => s.reconciledView);
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const metadataCache = useSelectionStore((s) => s.metadataCache);
  const onSearch = useMetadataSearch();

  // Reconciled category from the reconciliation engine
  const categoryRec = reconciledView?.get("usageRights_category");
  const categoryField = RECONCILE_FIELDS.find((f) => f.id === "usageRights_category");

  // Aggregate active + pending lease counts per access type across selection.
  // Uses isLeaseActive() (date-based) — does not trust the stale ES `active` snapshot.
  // Total is counted from cached images (not selectedIds.size) to avoid
  // twitch when a newly-added image hasn't loaded into cache yet.
  const nowMs = Date.now();
  const activeCounts: Record<string, number> = {
    "allow-use": 0, "deny-use": 0, "allow-syndication": 0, "deny-syndication": 0,
  };
  const pendingCounts: Record<string, number> = {
    "allow-use": 0, "deny-use": 0, "allow-syndication": 0, "deny-syndication": 0,
  };
  let imagesWithAnyExpired = 0;
  let cachedTotal = 0;
  for (const id of selectedIds) {
    const img = metadataCache.get(id);
    if (!img) continue;
    cachedTotal++;
    const leases = img.leases?.leases ?? [];
    const seenActive = new Set<string>();
    const seenPending = new Set<string>();
    let hasAnyExpired = false;
    for (const lease of leases) {
      if (isLeaseActive(lease, nowMs)) {
        if (!seenActive.has(lease.access)) {
          seenActive.add(lease.access);
          activeCounts[lease.access] = (activeCounts[lease.access] ?? 0) + 1;
        }
      } else if (lease.startDate && new Date(lease.startDate).getTime() > nowMs) {
        // Pending: start in future
        if (!seenPending.has(lease.access)) {
          seenPending.add(lease.access);
          pendingCounts[lease.access] = (pendingCounts[lease.access] ?? 0) + 1;
        }
      } else {
        hasAnyExpired = true;
      }
    }
    if (hasAnyExpired) imagesWithAnyExpired++;
  }
  const hasAnyActive = Object.values(activeCounts).some((c) => c > 0);
  const hasAnyPending = Object.values(pendingCounts).some((c) => c > 0);

  return (
    <>
      {/* Rights & restrictions — stacked layout matching Kahuna */}
      <MetadataSection>
        {categoryField && categoryRec && (
          <MetadataBlock label="Rights & restrictions">
            {renderField(categoryField, categoryRec, onSearch, selectedIds.size) === null ? (
              <Dash />
            ) : categoryRec.kind === "all-same" ? (() => {
              const raw = String((categoryRec as { value: unknown }).value);
              return (
                <ValueLink
                  cqlKey={categoryField.cqlKey!}
                  value={raw}
                  label={categoryLabel(raw)}
                  onSearch={onSearch}
                />
              );
            })()
            : categoryRec.kind === "mixed" ? (
              <MultiValue field={categoryField} topValues={(categoryRec as { topValues: Array<{ value: unknown; count: number }> }).topValues} total={selectedIds.size} />
            ) : categoryRec.kind === "all-empty" ? (
              <span className="text-xs text-grid-text-dim">None</span>
            ) : (
              <Dash />
            )}
          </MetadataBlock>
        )}
      </MetadataSection>

      {/* Leases — compact card rows, use before syndication, deny before allow, active before pending */}
      <MetadataSection>
        <div className="text-xs font-bold text-grid-text-dim pb-1">Leases</div>
        {!hasAnyActive && !hasAnyPending && imagesWithAnyExpired === 0 ? (
          <p className="text-xs text-grid-text-dim">No leases</p>
        ) : (
          <div className="space-y-0.5">
            {LEASE_ROW_ORDER.map(({ key, access, label, isAllow, state }) => (
              <LeaseTypeRow
                key={key}
                label={label}
                count={state === "active" ? activeCounts[access] : pendingCounts[access]}
                total={cachedTotal}
                isAllow={isAllow}
              />
            ))}
            {imagesWithAnyExpired > 0 && (
              <p className="text-2xs text-grid-text-dim italic mt-1">
                {imagesWithAnyExpired} image{imagesWithAnyExpired !== 1 ? "s" : ""} with expired leases
              </p>
            )}
          </div>
        )}
      </MetadataSection>
    </>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MultiImageMetadata() {
  const reconciledView = useSelectionStore((s) => s.reconciledView);
  const total = useSelectionStore((s) => s.selectedIds.size);
  const onSearch = useMetadataSearch();

  return (
    <>
      <CostSummarySection />
      <dl>
        <RightsAndLeasesSection />
      {MULTI_SECTIONS.map((sectionFields, si) => (
        <MetadataSection key={si}>
          {sectionFields.map((field) =>
            field.id === "__location__"
              ? renderLocationGroup(reconciledView, onSearch, total)
              : renderField(field, reconciledView?.get(field.id), onSearch, total),
          )}
        </MetadataSection>
      ))}
      </dl>
    </>
  );
}
