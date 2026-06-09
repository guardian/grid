/**
 * UsagesSection — usages panel for image detail and multi-selection.
 *
 * Single-image: groups usages by status (Published → Pending → Removed →
 * Syndicated → Downloads → Front). Per-row: platform icon, title, relative
 * date, reference links (Guardian globe, Composer C).
 *
 * Multi-image: aggregated stats across the selection read directly from the
 * selection-store metadataCache (same data source as MultiImageMetadata).
 *
 * Data is already present in image.usages[] from ES (SOURCE_INCLUDES).
 * No additional network call is needed.
 *
 * Mirrors Kahuna's gr-image-usage.js and gr-image-usage-list.html.
 */

import type { Image } from "@/types/image";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";

type Usage = NonNullable<Image["usages"]>[number];

// ---------------------------------------------------------------------------
// Status grouping
// ---------------------------------------------------------------------------

const STATUS_ORDER = ["published", "pending", "removed", "syndicated", "downloaded", "unknown"] as const;

const STATUS_LABELS: Record<string, string> = {
  published: "Published",
  pending: "Pending publication",
  removed: "Taken down",
  syndicated: "Syndicated",
  downloaded: "Downloads",
  unknown: "Front",
};

// ---------------------------------------------------------------------------
// Date helpers
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function isRecent(iso: string | undefined): boolean {
  if (!iso) return false;
  return Date.now() - new Date(iso).getTime() < SEVEN_DAYS_MS;
}

/** Relative time via Intl.RelativeTimeFormat — e.g. "25 minutes ago", "in 3 days", "2 years ago". */
const _rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

function formatRelativeTime(iso: string): string {
  try {
    const diffMs = new Date(iso).getTime() - Date.now();
    const absMs = Math.abs(diffMs);
    if (absMs < 45_000) return "just now";
    const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
      ["year",  365 * 86_400_000],
      ["month",  30 * 86_400_000],
      ["day",        86_400_000],
      ["hour",       3_600_000],
      ["minute",       60_000],
    ];
    for (const [unit, ms] of UNITS) {
      if (absMs >= ms) return _rtf.format(Math.round(diffMs / ms), unit);
    }
    return _rtf.format(Math.round(diffMs / 60_000), "minute");
  } catch {
    return iso;
  }
}

/** Full date for tooltip — e.g. "26 Nov 2021, 15:51" */
function formatDateFull(iso: string): string {
  try {
    return new Date(iso).toLocaleString("en-GB", {
      day: "numeric",
      month: "short",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

// ---------------------------------------------------------------------------
// Inline SVG icons (from kahuna/public/js/components/gr-icon/icons/)
// ---------------------------------------------------------------------------

function FrontendIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      className={className ?? "w-4 h-4"}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M64 0a64 64 0 1 0 64 64A64.1 64.1 0 0 0 64 0m10.9 15.8c9 1.3 18.9 7 22.7 11v18.6h-2L74.9 17.9zM68.1 17h-.3C53.3 17 45 37.1 45.4 64.2s7.9 47.2 22.4 47.2h.3v2.1A48.3 48.3 0 0 1 17.2 68l-.1-3.8a48.3 48.3 0 0 1 47.2-49.4h3.8zm36.4 51.5l-6.9 2.9v30.7a52.5 52.5 0 0 1-22.7 11.1V70.8l-6.8-2.5v-1.9h36.4z"
      />
    </svg>
  );
}

function ComposerIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 128 128"
      className={className ?? "w-4 h-4"}
      aria-hidden="true"
    >
      <path
        fill="currentColor"
        d="M12.2 64.8C12.2 16.6 45.2 0 76.8 0c15.3 0 28 2.4 35.6 5.4l1.2 33.4H98l-8-19.2c-3.5-1.5-8.3-3-14.2-3C58.4 16.6 49.6 29 49.6 62c0 38.7 8.4 49.7 27.2 49.7 6 0 11.5-1.8 14.8-3.5l8-20h15l-1.2 33c-8.8 4-20.5 6.8-40 6.8-34.2 0-61.2-17.8-61.2-63.2z"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Title resolution
// ---------------------------------------------------------------------------

function getUsageTitle(usage: Usage): string {
  // Use stored ES title field (computed server-side by the usage service).
  if (usage.title) return usage.title;

  // Fallback for old records without a stored title.
  if (usage.platform === "syndication" && usage.syndicationUsageMetadata?.partnerName) {
    return usage.syndicationUsageMetadata.partnerName;
  }
  if (usage.platform === "download" && usage.downloadUsageMetadata?.downloadedBy) {
    return usage.downloadUsageMetadata.downloadedBy;
  }
  // Try references for a name
  const named = usage.references?.find((r) => r.name);
  if (named?.name) return named.name;

  return "No title found.";
}

// ---------------------------------------------------------------------------
// Single usage row
// ---------------------------------------------------------------------------

function UsageRow({ usage }: { usage: Usage }) {
  const recent = isRecent(usage.dateAdded);
  const title = getUsageTitle(usage);
  const dateStr = usage.dateAdded ? formatRelativeTime(usage.dateAdded) : "";
  const dateFull = usage.dateAdded ? formatDateFull(usage.dateAdded) : "";

  return (
    <li className="py-1 text-xs">
      <div className="flex items-start gap-1.5">
        {/* Platform icon — print or digital only, red when recent */}
        {usage.platform === "print" && (
          /* Material local_library */
          <svg
            viewBox="0 0 24 24"
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${recent ? "text-red-400" : "text-grid-text-dim"}`}
            fill="currentColor"
            aria-label="Print"
          >
            <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
          </svg>
        )}
        {usage.platform === "digital" && (
          /* Material phonelink */
          <svg
            viewBox="0 0 24 24"
            className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${recent ? "text-red-400" : "text-grid-text-dim"}`}
            fill="currentColor"
            aria-label="Digital"
          >
            <path d="M4 6h18V4H4c-1.1 0-2 .9-2 2v11H0v3h14v-3H4V6zm19 2h-6c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h6c.55 0 1-.45 1-1V9c0-.55-.45-1-1-1zm-1 9h-4v-7h4v7z" />
          </svg>
        )}
        <span className="text-grid-text leading-snug">{title}</span>
      </div>

      {/* Date + reference links */}
      <div className="flex items-center gap-2 mt-0.5 text-grid-text-dim pl-5">
        {dateStr && (
          <span title={dateFull} className="cursor-default">
            {dateStr}
          </span>
        )}
        {usage.references?.map((ref, i) => {
          if (!ref.uri) return null;
          if (ref.type === "frontend") {
            return (
              <a
                key={i}
                href={ref.uri}
                target="_blank"
                rel="noopener noreferrer"
                title="View on Guardian website"
                className="text-grid-text-dim hover:text-grid-accent transition-colors"
              >
                <FrontendIcon className="w-3.5 h-3.5" />
              </a>
            );
          }
          if (ref.type === "composer") {
            return (
              <a
                key={i}
                href={ref.uri}
                target="_blank"
                rel="noopener noreferrer"
                title="Open in Composer"
                className="text-grid-text-dim hover:text-grid-accent transition-colors"
              >
                <ComposerIcon className="w-3.5 h-3.5" />
              </a>
            );
          }
          return null;
        })}
      </div>
    </li>
  );
}

// ---------------------------------------------------------------------------
// UsagesSection — single image
// ---------------------------------------------------------------------------

/** Count displayable usages (excluding derivative/replaced which are versions). */
export function countDisplayUsages(usages: Image["usages"]): number {
  if (!usages) return 0;
  return usages.filter((u) => u.platform !== "derivative" && u.platform !== "replaced").length;
}

export function UsagesSection({ usages }: { usages: Image["usages"] }) {
  const displayUsages = usages?.filter(
    (u) => u.platform !== "derivative" && u.platform !== "replaced",
  ) ?? [];

  if (displayUsages.length === 0) {
    return (
      <div className="px-3 py-4 text-xs text-grid-text-dim">
        No usages recorded.
      </div>
    );
  }

  // Group by status in STATUS_ORDER; unknown statuses go at end.
  const grouped = new Map<string, Usage[]>();
  for (const u of displayUsages) {
    const key = u.status;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(u);
  }

  const orderedGroups: Array<[string, Usage[]]> = [];
  for (const status of STATUS_ORDER) {
    const group = grouped.get(status);
    if (group) {
      orderedGroups.push([status, group]);
      grouped.delete(status);
    }
  }
  // Any remaining (e.g. failed, derivative that slipped through)
  for (const [key, group] of grouped) {
    orderedGroups.push([key, group]);
  }

  return (
    <div className="divide-y divide-grid-separator">
      {orderedGroups.map(([status, items]) => {
        const label = STATUS_LABELS[status] ?? status;
        const sorted = [...items].sort((a, b) => {
          if (!a.dateAdded && !b.dateAdded) return 0;
          if (!a.dateAdded) return 1;
          if (!b.dateAdded) return -1;
          return new Date(b.dateAdded).getTime() - new Date(a.dateAdded).getTime();
        });

        return (
          <div key={status} className="px-3 py-2">
            <p className="text-xs font-medium text-grid-text-dim mb-1.5">
              {label} ({items.length})
            </p>
            <ul className="divide-y divide-grid-separator/50">
              {sorted.map((usage) => (
                <UsageRow key={usage.id} usage={usage} />
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// MultiUsagesSummary — aggregate stats for 2+ selected images
// ---------------------------------------------------------------------------

export function MultiUsagesSummary() {
  const selectedIds = useSelectionStore((s) => s.selectedIds);
  const metadataCache = useSelectionStore((s) => s.metadataCache);
  const results = useSearchStore((s) => s.results);
  const imagePositions = useSearchStore((s) => s.imagePositions);
  const bufferOffset = useSearchStore((s) => s.bufferOffset);

  // Resolve images: buffer first, then metadataCache for out-of-buffer.
  const images: Image[] = [];
  for (const id of selectedIds) {
    const globalIdx = imagePositions.get(id);
    if (globalIdx != null) {
      const localIdx = globalIdx - bufferOffset;
      if (localIdx >= 0 && localIdx < results.length && results[localIdx]) {
        images.push(results[localIdx]!);
        continue;
      }
    }
    const cached = metadataCache.get(id);
    if (cached) images.push(cached);
  }

  // Denominator is images.length — only resolved images are checked.
  // (Some selected-but-out-of-buffer images may still be loading into metadataCache.)
  const now = Date.now();
  const sevenDaysAgo = now - SEVEN_DAYS_MS;

  let digitalCount = 0, recentDigitalCount = 0;
  let printCount = 0, recentPrintCount = 0;
  let syndicatedCount = 0, downloadCount = 0, noUsagesCount = 0;

  // Per-platform status breakdowns (images with that status on that platform)
  const digitalStatuses: Record<string, number> = {};
  const printStatuses: Record<string, number> = {};

  for (const img of images) {
    const usages = img.usages ?? [];
    if (usages.length === 0) {
      noUsagesCount++;
      continue;
    }
    let hasDigital = false, hasRecentDigital = false;
    let hasPrint = false, hasRecentPrint = false;
    let hasSyndicated = false, hasDownload = false;
    const seenDigitalStatuses = new Set<string>();
    const seenPrintStatuses = new Set<string>();

    for (const u of usages) {
      const recentUsage = u.dateAdded ? new Date(u.dateAdded).getTime() > sevenDaysAgo : false;
      if (u.platform === "digital") {
        hasDigital = true;
        if (recentUsage) hasRecentDigital = true;
        seenDigitalStatuses.add(u.status);
      } else if (u.platform === "print") {
        hasPrint = true;
        if (recentUsage) hasRecentPrint = true;
        seenPrintStatuses.add(u.status);
      } else if (u.platform === "syndication") {
        hasSyndicated = true;
      } else if (u.platform === "download") {
        hasDownload = true;
      }
    }

    if (hasDigital) {
      digitalCount++;
      for (const s of seenDigitalStatuses) digitalStatuses[s] = (digitalStatuses[s] ?? 0) + 1;
    }
    if (hasRecentDigital) recentDigitalCount++;
    if (hasPrint) {
      printCount++;
      for (const s of seenPrintStatuses) printStatuses[s] = (printStatuses[s] ?? 0) + 1;
    }
    if (hasRecentPrint) recentPrintCount++;
    if (hasSyndicated) syndicatedCount++;
    if (hasDownload) downloadCount++;
  }

  const STATUS_LABEL: Record<string, string> = {
    published: "Published",
    pending: "Pending",
    removed: "Taken down",
    syndicated: "Syndicated",
    downloaded: "Downloaded",
    unknown: "Front",
  };

  return (
    <div className="px-3 py-3 text-xs space-y-1.5">

      <UsagePlatformStat label="Digital" count={digitalCount} recentCount={recentDigitalCount} total={images.length} statuses={digitalStatuses} statusLabel={STATUS_LABEL} />
      <UsagePlatformStat label="Print" count={printCount} recentCount={recentPrintCount} total={images.length} statuses={printStatuses} statusLabel={STATUS_LABEL} />

      {syndicatedCount > 0 && (
        <div className="flex justify-between">
          <span className="text-grid-text-dim">Syndicated</span>
          <span className="text-grid-text">{syndicatedCount}/{images.length}</span>
        </div>
      )}
      {downloadCount > 0 && (
        <div className="flex justify-between">
          <span className="text-grid-text-dim">Downloads</span>
          <span className="text-grid-text">{downloadCount}/{images.length}</span>
        </div>
      )}
      {noUsagesCount > 0 && (
        <div className="flex justify-between">
          <span className="text-grid-text-dim">No usages</span>
          <span className="text-grid-text">{noUsagesCount}</span>
        </div>
      )}
    </div>
  );
}

function UsagePlatformStat({
  label,
  count,
  recentCount,
  total,
  statuses,
  statusLabel,
}: {
  label: string;
  count: number;
  recentCount: number;
  total: number;
  statuses: Record<string, number>;
  statusLabel: Record<string, string>;
}) {
  const STATUS_ORDER = ["published", "pending", "removed", "syndicated", "downloaded", "unknown"];
  const statusEntries = STATUS_ORDER
    .filter((s) => statuses[s] > 0)
    .map((s) => [s, statuses[s]] as [string, number]);
  // Append any statuses not in the canonical order
  for (const [s, n] of Object.entries(statuses)) {
    if (!STATUS_ORDER.includes(s) && n > 0) statusEntries.push([s, n]);
  }

  return (
    <div>
      <div className="flex justify-between">
        <span className="text-grid-text-dim">{label}</span>
        <span className="text-grid-text">
          {count === 0 ? (
            <span className="text-grid-text-dim">none</span>
          ) : (
            <>
              {count}/{total}
              {recentCount > 0 && (
                <span className="text-red-400 ml-1" title={`${recentCount} within 7 days`}>
                  ({recentCount} recent)
                </span>
              )}
            </>
          )}
        </span>
      </div>
      {statusEntries.map(([s, n]) => (
        <div key={s} className="flex justify-between pl-4 text-grid-text-dim">
          <span>{statusLabel[s] ?? s}</span>
          <span>{n}</span>
        </div>
      ))}
    </div>
  );
}
