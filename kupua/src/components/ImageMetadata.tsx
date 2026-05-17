/**
 * ImageMetadata -- shared metadata display for an image.
 *
 * Used in two contexts:
 *   1. ImageDetail sidebar (single-image view)
 *   2. Right side panel in grid/table view (shows focused image's metadata)
 *
 * Takes an Image and renders a definition list of its metadata fields.
 * No layout chrome (no <aside>, no width, no border) -- callers handle
 * their own container styling.
 *
 * Field order, layout (stacked vs inline), and visibility are all driven
 * by the field registry (DETAIL_PANEL_FIELDS). Section breaks are inserted
 * whenever the `group` changes between consecutive fields.
 *
 * Display rules replicate kahuna's layout:
 *   - Sections separated by solid #565656 dividers (kahuna's image-info__group
 *     border-bottom: 1px solid #565656) -- these are orientation landmarks
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
 * Primitives (ValueLink, MetadataSection, MetadataRow, MetadataBlock, FieldValue,
 * groupFieldsIntoSections, useMetadataSearch) live in metadata-primitives.tsx and
 * are shared with MultiImageMetadata.
 *
 * See kupua/exploration/docs/zz Archive/metadata-display-plan.md for the full design.
 */

import type { Image } from "@/types/image";
import { DETAIL_PANEL_FIELDS } from "@/lib/field-registry";
import {
  useMetadataSearch,
  MetadataSection,
  MetadataRow,
  MetadataBlock,
  FieldValue,
  groupFieldsIntoSections,
  Dash,
} from "./metadata-primitives";
import { useEnrichedImage } from "@/hooks/useEnrichedImage";
import { VALIDITY_DESCRIPTIONS } from "@/lib/cost/validity-map";
import { isLeaseActive } from "@/lib/syndication/calculate-syndication-status";
import { gridConfig } from "@/lib/grid-config";
import { categoryLabel } from "@/lib/category-labels";


const SECTIONS = groupFieldsIntoSections(DETAIL_PANEL_FIELDS);

/** Human-readable labels for lease access types (Kahuna inventory row 28). */
const LEASE_ACCESS_LABELS: Record<string, string> = {
  "allow-use": "Allow use",
  "deny-use": "Deny use",
  "allow-syndication": "Allow syndication",
  "deny-syndication": "Deny syndication",
};

/** Format a lease date as relative time with sub-day precision (Kahuna parity via moment.fromNow). */
function formatLeaseRelative(iso: string | undefined, label: "start" | "end"): string | null {
  if (!iso) return label === "end" ? "Never expires" : null;
  try {
    const d = new Date(iso);
    const now = Date.now();
    const diffMs = d.getTime() - now;
    const absMs = Math.abs(diffMs);
    const isFuture = diffMs > 0;

    // Human-readable relative string
    let rel: string;
    if (absMs < 60_000) {
      rel = "a moment";
    } else if (absMs < 3_600_000) {
      const mins = Math.round(absMs / 60_000);
      rel = `${mins} minute${mins !== 1 ? "s" : ""}`;
    } else if (absMs < 86_400_000) {
      const hrs = Math.round(absMs / 3_600_000);
      rel = `${hrs} hour${hrs !== 1 ? "s" : ""}`;
    } else {
      const days = Math.round(absMs / 86_400_000);
      if (days === 1) {
        rel = isFuture ? "tomorrow" : "yesterday";
      } else {
        rel = `${days} days`;
      }
    }

    // Compose sentence
    if (label === "end") {
      if (!isFuture) return rel === "yesterday" ? "Expired yesterday" : `Expired ${rel} ago`;
      return rel === "tomorrow" ? "Expires tomorrow" : `Expires in ${rel}`;
    }
    // start
    if (isFuture) return rel === "tomorrow" ? "Starts tomorrow" : `Starts in ${rel}`;
    return rel === "yesterday" ? "Started yesterday" : `Started ${rel} ago`;
  } catch {
    return iso;
  }
}

/** Is this lease pending (start in future)? */
function isLeasePending(lease: { startDate?: string }, nowMs: number): boolean {
  if (!lease.startDate) return false;
  return new Date(lease.startDate).getTime() > nowMs;
}

/** Sort key for leases: use before syndication, deny before allow,
 *  active+pending before expired, creation date within. */
function leaseSortKey(lease: { access: string; startDate?: string; endDate?: string; createdAt?: string }, nowMs: number): string {
  // Group: use=0, syndication=1
  const group = lease.access.includes("use") ? "0" : "1";
  // Sub-group: deny=0, allow=1
  const deny = lease.access.includes("deny") ? "0" : "1";
  // State: active=0, pending=1, expired=2
  const active = isLeaseActive(lease as { startDate?: string; endDate?: string }, nowMs);
  const pending = isLeasePending(lease, nowMs);
  const state = active ? "0" : pending ? "1" : "2";
  // Creation date for stable sub-sort
  const created = lease.createdAt ?? "";
  return `${group}${deny}${state}${created}`;
}

/** Format a lease createdAt for the tooltip: "D MMM YYYY, HH:mm" (Kahuna parity). */
function formatLeaseCreatedAt(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    const day = d.getDate();
    const month = d.toLocaleString("en-GB", { month: "short" });
    const year = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${day} ${month} ${year}, ${hh}:${mm}`;
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// ImageMetadata — the full metadata display, driven by the field registry
// ---------------------------------------------------------------------------

interface ImageMetadataProps {
  image: Image;
}

export function ImageMetadata({ image }: ImageMetadataProps) {
  const onSearch = useMetadataSearch();
  const enriched = useEnrichedImage(image);

  // All cost/validity fields come from deriveImage (ES baseline + API overlay)
  const cost = enriched?.cost ?? "pay";
  const invalidReasons = enriched?.invalidReasons ?? {};
  const isValid = enriched?.valid ?? true;

  // Usage rights — from enrichment overlay (API-authoritative) or ES baseline
  const usageRights = enriched?.usageRights ?? image.usageRights;
  const restrictions = usageRights?.restrictions;
  const category = usageRights?.category;

  // Lease data — prefer enrichment summary (always available from mirror-search),
  // fall back to raw ES leases (only available once SOURCE_INCLUDES is fixed).
  const leasesSummary = enriched?.leasesSummary;
  const allLeases = image.leases?.leases ?? [];
  const nowMs = Date.now();
  const currentLeaseCount = leasesSummary?.currentCount ?? allLeases.filter((l) => isLeaseActive(l, nowMs)).length;
  const inactiveLeaseCount = leasesSummary?.inactiveCount ?? allLeases.filter((l) => !isLeaseActive(l, nowMs)).length;
  const hasLeases = currentLeaseCount + inactiveLeaseCount > 0;

  // Validity banner colour (Kahuna's three-state system):
  // - red: invalid (strong warning — deleted, not overridden, or cost=pay)
  // - amber: warning (invalid reasons exist but overridden / leased)
  // - teal: leased override (has active allow-use lease)
  const hasInvalidReasons = Object.keys(invalidReasons).length > 0;
  const hasActiveAllowLease = leasesSummary?.hasActiveAllowLease
    ?? allLeases.some((l) => l.access === "allow-use" && isLeaseActive(l, nowMs));
  const isOverridden = hasInvalidReasons && isValid;
  const isStrongWarning = !isOverridden || cost === "pay";
  const showValidityBanner = hasInvalidReasons || !isValid;

  // Deny-syndication warning (row 21 in detail inventory, rule #5).
  // Uses date-based isLeaseActive — does not trust the ES `active` snapshot.
  const hasActiveDenySyndicationLease = allLeases.some(
    (l) => l.access === "deny-syndication" && isLeaseActive(l, nowMs)
  );
  const showDenySyndicationBanner = gridConfig.showDenySyndicationWarning && hasActiveDenySyndicationLease;

  // Syndication rights display (row 48 in detail inventory).
  const syndicationRights = image.syndicationRights;
  const hasSyndicationRightsInfo = syndicationRights != null;
  const hasRightsAcquired = hasSyndicationRightsInfo && (syndicationRights.rights?.some((r) => r.acquired === true) ?? false);

  return (
    <dl>
      {/* Validity banner — full-width colored banner at the very top.
          Three visual states: red (can't use), amber (warnings), teal (leased override).
          Only shown when there are actual invalid reasons — free images get no banner.
          Negative margins break out of parent aside padding to span full width. */}
      {showValidityBanner && (
        <div
          className={`-mx-3 -mt-3 px-3 py-2 text-xs text-white text-center ${
            isStrongWarning
              ? "bg-[red]"
              : hasActiveAllowLease
                ? "bg-[teal]"
                : "bg-[orange]"
          } ${restrictions ? "" : "mb-2"}`}
        >
          <strong>
            {isOverridden
              ? "This image can be used, but has warnings:"
              : "This image can\u2019t be used"}
          </strong>
          <ul className="mt-1 list-none">
            {Object.entries(invalidReasons).map(([key, desc]) => (
              <li key={key}>
                {VALIDITY_DESCRIPTIONS[key] ?? desc ?? key}
              </li>
            ))}
            {showDenySyndicationBanner && (
              <li>{gridConfig.denySyndicationTextHeader}</li>
            )}
          </ul>
        </div>
      )}

      {/* Restrictions banner — orange, shows the actual restriction text.
          Can appear alongside the validity banner (both visible simultaneously). */}
      {restrictions && (
        <div className={`-mx-3 px-3 py-2 text-xs text-white text-center bg-[orange] mb-2 ${showValidityBanner ? "" : "-mt-3"}`}>
          <strong>Restricted use:</strong> {restrictions}
        </div>
      )}

      {/* Deny-syndication warning — amber standalone banner (only when no validity issues).
          When validity issues exist, the deny-syndication message is appended as a <li>
          inside the validity banner instead (Kahuna behaviour). */}
      {showDenySyndicationBanner && !showValidityBanner && (
        <div className={`-mx-3 px-3 py-2 text-xs text-white text-center bg-[orange] mb-2 ${(!restrictions) ? "-mt-3" : ""}`}>
          <strong>This image can be used, but has warnings:</strong>
          <ul className="mt-1 list-none">
            <li>{gridConfig.denySyndicationTextHeader}</li>
          </ul>
        </div>
      )}

      {/* Rights section — FIRST section, matching Kahuna's gr-image-metadata internal order:
          Rights & restrictions → Leases → then regular metadata fields. */}
      <MetadataSection>
        {/* Usage rights category — stacked layout (label above, value below) like Kahuna */}
        <div className="py-0.75 leading-snug">
          <dt className="text-xs font-bold text-grid-text-dim">Rights &amp; restrictions</dt>
          <dd className="text-xs text-grid-text mt-0.5">
            {categoryLabel(category)}
          </dd>
        </div>
      </MetadataSection>

      {/* Leases section — own section with heading, matching Kahuna layout.
          Counts come from enrichment (always available); individual cards only
          render when raw ES lease data is present (after SOURCE_INCLUDES fix). */}
      {hasLeases && (
        <MetadataSection>
          <div className="text-xs font-bold text-grid-text-dim pb-1">Leases</div>
          {allLeases.length > 0 ? (
            <ul className="space-y-1 list-none">
              {[...allLeases].sort((a, b) => leaseSortKey(a, nowMs).localeCompare(leaseSortKey(b, nowMs))).map((lease) => {
                const active = isLeaseActive(lease, nowMs);
                const pending = isLeasePending(lease, nowMs);
                const endRel = formatLeaseRelative(lease.endDate, "end");
                // Show start only for pending leases (active/expired: start is noise)
                const startRel = pending ? formatLeaseRelative(lease.startDate, "start") : null;
                const isAllow = lease.access.includes("allow");
                const createdAtFormatted = formatLeaseCreatedAt(lease.createdAt);
                // Tooltip: absolute date for the relevant temporal event + leased-by + leased-at
                const tooltipLines: string[] = [];
                if (pending && lease.startDate) {
                  tooltipLines.push(`starts at: ${formatLeaseCreatedAt(lease.startDate)}`);
                } else if (!active && lease.endDate) {
                  // expired
                  tooltipLines.push(`expired at: ${formatLeaseCreatedAt(lease.endDate)}`);
                } else if (active && lease.endDate) {
                  tooltipLines.push(`expires at: ${formatLeaseCreatedAt(lease.endDate)}`);
                }
                if (lease.leasedBy) tooltipLines.push(`leased by: ${lease.leasedBy}`);
                if (createdAtFormatted) tooltipLines.push(`leased at: ${createdAtFormatted}`);
                const tooltip = tooltipLines.length > 0 ? tooltipLines.join("\n") : undefined;
                return (
                  <li
                    key={lease.id}
                    className={`text-2xs bg-[#565656] rounded-sm ${
                      active ? "" : pending ? "" : "opacity-50"
                    }`}
                    title={tooltip}
                  >
                    <div className={`border-t-[5px] rounded-t-sm p-1.5 ${
                      isAllow ? "border-[teal]" : "border-[red]"
                    }`}>
                      <div className="font-medium">{LEASE_ACCESS_LABELS[lease.access] ?? lease.access}{pending ? " (pending)" : ""}</div>
                      {startRel && <p className="italic my-0.5">{startRel}</p>}
                      {endRel && <p className="italic my-0.5">{endRel}</p>}
                      {lease.notes && <div className="mt-0.5">{lease.notes}</div>}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            /* Enrichment-only: show count summary without expandable cards */
            <span className="text-xs text-grid-text">
              {currentLeaseCount} current{inactiveLeaseCount > 0 ? ` · ${inactiveLeaseCount} inactive` : ""}
            </span>
          )}
        </MetadataSection>
      )}

      {/* Regular metadata fields from field registry */}
      {SECTIONS.map((section, sIdx) => (
        <MetadataSection key={sIdx}>
          {section.map((field) => {
            if (field.visibleWhen?.() === false) return null;

            const raw = field.accessor(image);
            const hasValue = Array.isArray(raw) ? raw.length > 0 : raw != null && raw !== "";

            if (!hasValue) {
              if (!field.showWhenEmpty) return null;
              const Layout = field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;
              return (
                <Layout key={field.id} label={field.label}>
                  <Dash />
                </Layout>
              );
            }

            const Layout = field.detailLayout === "stacked" ? MetadataBlock : MetadataRow;
            return (
              <Layout key={field.id} label={field.label}>
                <FieldValue field={field} image={image} onSearch={onSearch} />
              </Layout>
            );
          })}
        </MetadataSection>
      ))}

      {/* Syndication Rights section (row 48 in detail inventory) — bottom of panel.
          `isInferred` and `published` are available on the type but not rendered in v1
          (matches Kahuna; data layer is ready for a future iteration without schema changes). */}
      <MetadataSection>
        <div className="text-xs font-bold text-grid-text-dim pb-1">Syndication rights</div>
        <p className="text-xs text-grid-text">
          {!hasSyndicationRightsInfo ? (
            "No information available."
          ) : hasRightsAcquired ? (
            "Syndication rights have been acquired for this image."
          ) : (
            <>Syndication rights have <strong>not</strong> been acquired for this image.</>
          )}
        </p>
      </MetadataSection>
    </dl>
  );
}

