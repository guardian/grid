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

import { useId, useMemo, useRef, useState } from "react";
import { FieldDisclosure } from "./FieldDisclosure";
import type { Image } from "@/types/image";
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
import { LabelEditor } from "./LabelEditor";
import type { LabelEditContext } from "@/lib/label-operation";
import { MultiValue } from "./MultiValue";
import { isLeaseActive } from "@/lib/syndication/calculate-syndication-status";
import { deriveImage } from "@/lib/derive-enriched-image";
import { useCategoryLabel } from "@/lib/category-labels";
import { attachedEnrichment, useEnrichmentStore } from "@/stores/enrichment-store";
import { resolveImageOverlay } from "@/lib/image-read-freshness";
import type { Cost } from "@/dal/grid-api/types";
import { MetadataTextEditor, METADATA_EDIT_CONTROLS } from "./MetadataTextEditor";
import { MetadataPillEditor, PILL_EDIT_FIELDS } from "./MetadataPillEditor";
import { labelTargetKey } from "@/stores/label-editor-store";
import { MetadataLocationEditor, LOCATION_COMPONENTS } from "./MetadataLocationEditor";
import { findLink } from "@/dal/grid-api/argo";


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
  editing?: { targetIds: readonly string[]; available: boolean; editable: boolean },
): React.ReactNode {
  if (!reconciledView && !(editing && import.meta.env.VITE_USE_MEDIA_API === "true")) return null;

  // Build one node per non-empty sub-field segment.
  const parts: React.ReactNode[] = [];
  let anyNonEmpty = false;

  for (const field of LOCATION_FIELDS) {
    const rec = reconciledView?.get(field.id);
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

  const content = <span>
        {parts.map((part, i) => (
          <span key={i}>
            <span className="inline-flex max-w-full items-baseline">
              <span className="min-w-0">{part}</span>
              {i < parts.length - 1 && <span className="shrink-0">,</span>}
            </span>
            {i < parts.length - 1 && " "}
          </span>
        ))}
      </span>;
  const readOnly = !anyNonEmpty && parts.length === 0 ? null : (
    <MetadataRow key="__location__" label="Location">{content}</MetadataRow>
  );
  if (editing && import.meta.env.VITE_USE_MEDIA_API === "true") {
    const fields = LOCATION_COMPONENTS.map(component => {
      const rec = reconciledView?.get(component.fieldId);
      return { ...component, value: rec?.kind === "all-same" && typeof rec.value === "string" ? rec.value : "", mixed: rec?.kind === "mixed" };
    });
    const ready = editing.available && LOCATION_COMPONENTS.every(component => {
      const kind = reconciledView?.get(component.fieldId)?.kind;
      return kind === "all-same" || kind === "mixed" || kind === "all-empty";
    });
    return <MetadataLocationEditor key={`location:${labelTargetKey(editing.targetIds)}`} fields={fields} targetIds={editing.targetIds}
      available={ready} editable={editing.editable} readOnly={readOnly}>
      {ready && parts.length ? content : <Dash />}
    </MetadataLocationEditor>;
  }
  return readOnly;
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

const INITIAL_CHIPS = 20;

function MultiChipField({ field, rec, onSearch, expanded, onToggle }: {
  field: FieldDefinition;
  rec: Extract<FieldReconciliation, { kind: "chip-array" }>;
  onSearch: (cqlKey: string, v: string, e: React.MouseEvent) => void;
  expanded: boolean;
  onToggle: (expanded: boolean) => void;
}) {
  const headerRef = useRef<HTMLDivElement>(null);
  const valuesId = useId();
  const chips = useMemo(() => [...rec.chips].sort((a, b) => b.count - a.count), [rec.chips]);

  const visibleChips = expanded ? chips : chips.slice(0, INITIAL_CHIPS);
  return (
    <MetadataRow ref={headerRef} tabIndex={-1} label={field.label}>
      <div id={valuesId} className="flex flex-wrap gap-1 pt-0.5">
        {visibleChips.map((chip) => (
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
      <FieldDisclosure
        expanded={expanded}
        hasMore={chips.length > INITIAL_CHIPS}
        controlsId={valuesId}
        anchorRef={headerRef}
        onExpand={() => onToggle(true)}
        onCollapse={() => onToggle(false)}
      />
    </MetadataRow>
  );
}

function renderChipField(
  field: FieldDefinition,
  rec: FieldReconciliation | undefined,
  onSearch: (cqlKey: string, v: string, e: React.MouseEvent) => void,
  expanded: boolean,
  onToggle: (expanded: boolean) => void,
): React.ReactNode {
  if (field.visibleWhen?.() === false) return null;
  if (!rec || rec.kind === "pending" || rec.kind === "dirty") {
    return <MetadataRow key={field.id} label={field.label}><Dash /></MetadataRow>;
  }
  if (rec.kind !== "chip-array" || rec.chips.length === 0) return null;
  return <MultiChipField key={field.id} field={field} rec={rec} onSearch={onSearch} expanded={expanded} onToggle={onToggle} />;
}

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
        <span className="text-grid-text-dim">Unknown</span>
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
const COST_LABEL: Record<Cost, string> = {
  free: "free",
  conditional: "restricted",
  pay: "paid",
  overquota: "over quota",
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

interface MultiImageMetadataProps {
  labelEditing?: LabelEditContext;
  resolveLabelEditing?: () => LabelEditContext;
  images: readonly Image[];
  reconciledView: ReconciledView | null;
  total: number;
}

function CostSummarySection({ images }: Pick<MultiImageMetadataProps, "images">) {
  const enrichmentData = useEnrichmentStore((s) => s.data);
  const categoryLabel = useCategoryLabel();

  // Aggregate: count per cost bucket
  const counts = new Map<Cost | "no-rights", number>();
  const leasedCounts = new Map<Cost | "no-rights", number>();

  for (const img of images) {
    const enriched = deriveImage(img, resolveImageOverlay(img, enrichmentData.get(img.id), attachedEnrichment(img)));
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
            {count} {bucket === "no-rights" ? categoryLabel("") : COST_LABEL[bucket]}
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

function RightsAndLeasesSection({ images, reconciledView, total }: MultiImageMetadataProps) {
  const onSearch = useMetadataSearch();
  const categoryLabel = useCategoryLabel();

  // Reconciled category from the reconciliation engine
  const categoryRec = reconciledView?.get("usageRights_category");
  const categoryField = RECONCILE_FIELDS.find((f) => f.id === "usageRights_category");

  // Aggregate active + pending lease counts per access type across selection.
  // Uses isLeaseActive() (date-based) — does not trust the stale ES `active` snapshot.
  // Total is counted from cached images (not selection size) to avoid
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
  for (const img of images) {
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
            {categoryRec.kind === "all-same" ? (() => {
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
              <MultiValue field={categoryField} topValues={(categoryRec as { topValues: Array<{ value: unknown; count: number }> }).topValues} total={total} />
            ) : categoryRec.kind === "all-empty" ? (
              <span className="text-xs text-grid-text-dim">{categoryLabel("")}</span>
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

export function MultiImageMetadata({ images, reconciledView, total, labelEditing, resolveLabelEditing }: MultiImageMetadataProps) {
  const onSearch = useMetadataSearch();
  const ids = labelEditing?.targetIds ?? images.map(image => image.id);
  const targetKey = labelTargetKey(ids);
  const loadedIds = new Set(images.map(image => image.id));
  const complete = ids.length === total && ids.every(id => loadedIds.has(id)) && !labelEditing?.pending;
  const enrichment = useEnrichmentStore(state => state.data);
  const canEditMetadata = images.length > 0 && images.every(image => {
    const resource = labelEditing?.targets.get(image.id)?.resource
      ?? resolveImageOverlay(image, enrichment.get(image.id), attachedEnrichment(image))?.resource;
    return Boolean(resource && findLink(resource, "edits"));
  });
  const collectionPaths = new Map(images.flatMap(image => image.collections?.flatMap(collection => collection.pathId ? [[collection.pathId, collection.path ?? collection.pathId.split("/")] as const] : []) ?? []));
  const [expandedFields, setExpandedFields] = useState<ReadonlySet<string>>(() => new Set());
  const toggleField = (id: string, expanded: boolean) => setExpandedFields((current) => {
    const next = new Set(current);
    if (expanded) next.add(id);
    else next.delete(id);
    return next;
  });

  return (
    <>
      <CostSummarySection images={images} />
      <dl>
        <RightsAndLeasesSection images={images} reconciledView={reconciledView} total={total} />
      {MULTI_SECTIONS.map((sectionFields, si) => (
        <MetadataSection key={si} additional={sectionFields[0]?.detailGroup === "extended"}>
          {sectionFields.map((field) => {
            if (field.visibleWhen?.() === false) return null;
            const rec = reconciledView?.get(field.id);
            if (PILL_EDIT_FIELDS.has(field.id) && import.meta.env.VITE_USE_MEDIA_API === "true") {
              return <MetadataPillEditor key={`${field.id}:${targetKey}`} field={field} targetIds={ids} onSearch={onSearch}
                editable={canEditMetadata}
                readOnly={renderChipField(field, rec, onSearch, expandedFields.has(field.id), (expanded) => toggleField(field.id, expanded))}
                available={canEditMetadata && complete && (rec?.kind === "chip-array" || rec?.kind === "all-empty")}
                values={rec?.kind === "chip-array" ? rec.chips : []}
                collectionPaths={field.id === "collections" ? collectionPaths : undefined} />;
            }
            const hideExtraInstructions = field.id === "metadata_specialInstructions" && rec?.kind === "all-empty"
              && images.some(image => Boolean(image.metadata?.usageInstructions));
            if (METADATA_EDIT_CONTROLS.has(field.id) && import.meta.env.VITE_USE_MEDIA_API === "true") {
              return <MetadataTextEditor key={`${field.id}:${targetKey}`} field={field} targetIds={ids}
                editable={canEditMetadata} readOnly={hideExtraInstructions ? null : renderField(field, rec, onSearch, total)}
                furtherInstructions={field.id === "metadata_specialInstructions" && images.some(image => Boolean(image.metadata?.usageInstructions))}
                available={canEditMetadata && complete && (rec?.kind === "all-same" || rec?.kind === "mixed" || rec?.kind === "all-empty")}
                value={rec?.kind === "all-same" && typeof rec.value === "string" ? rec.value : ""} mixed={rec?.kind === "mixed"}>
                {!complete ? <Dash /> : rec?.kind === "mixed" ? <MultiValue field={field} topValues={rec.topValues} total={total} />
                  : rec?.kind === "all-same" ? renderScalarAllSame(field, rec.value, onSearch) : <Dash />}
              </MetadataTextEditor>;
            }
            if (hideExtraInstructions) return null;
            return (
            field.id === "labels" && labelEditing && import.meta.env.VITE_USE_MEDIA_API === "true"
              ? <LabelEditor key={field.id} context={labelEditing} resolveContext={resolveLabelEditing} onSearch={onSearch}
                  values={reconciledView?.get(field.id)?.kind === "chip-array"
                    ? (reconciledView.get(field.id) as Extract<FieldReconciliation, { kind: "chip-array" }>).chips : []} />
              : field.id === "__location__"
              ? renderLocationGroup(reconciledView, onSearch, total, { targetIds: ids, available: complete, editable: canEditMetadata })
              : field.multiSelectBehaviour === "chip-array"
                ? renderChipField(field, reconciledView?.get(field.id), onSearch, expandedFields.has(field.id), (expanded) => toggleField(field.id, expanded))
                : renderField(field, reconciledView?.get(field.id), onSearch, total));
          })}
        </MetadataSection>
      ))}
      </dl>
    </>
  );
}
