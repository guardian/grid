import type { SyndicationStatus } from "@/dal/grid-api/types";
import { syndicationReason } from "@/lib/syndication/syndication-reason";

interface SyndicationBadgeProps {
  status: SyndicationStatus | null | undefined;
}

/**
 * SyndicationBadge — monetization_on icon with status-driven colour.
 *
 * Returns null for `unsuitable` and null/undefined (no badge shown).
 * Colours per syndication.md §5.1:
 *   sent=green, queued=orange, blocked=red, review=white.
 */
export function SyndicationBadge({ status }: SyndicationBadgeProps) {
  if (status == null || status === "unsuitable") return null;

  const colorClass =
    status === "sent" ? "text-green-400"
    : status === "queued" ? "text-orange-400"
    : status === "blocked" ? "text-red-400"
    : "text-white"; /* review */

  return (
    <span className={colorClass} title={syndicationReason(status)}>
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" width={16} height={16}>
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1.41 16.09V20h-2.67v-1.93c-1.71-.36-3.16-1.46-3.27-3.4h1.96c.1 1.05.82 1.87 2.65 1.87 1.96 0 2.4-.98 2.4-1.59 0-.83-.44-1.61-2.67-2.14-2.48-.6-4.18-1.62-4.18-3.67 0-1.72 1.39-2.84 3.11-3.21V4h2.67v1.95c1.86.45 2.79 1.86 2.85 3.39H14.3c-.05-1.11-.64-1.87-2.22-1.87-1.5 0-2.4.68-2.4 1.64 0 .84.65 1.39 2.67 1.94s4.18 1.36 4.18 3.85c0 1.89-1.44 2.98-3.12 3.19z" />
      </svg>
    </span>
  );
}
