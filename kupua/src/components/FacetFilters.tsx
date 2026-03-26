/**
 * FacetFilters — left panel content showing faceted value lists with counts.
 *
 * Reads aggregation results from the search store. Each aggregatable field
 * from the field registry renders as a stacked section with value + count
 * pairs. Clicking a value adds/removes a CQL chip via updateSearch().
 *
 * Aggregations are fetched lazily — only when the Filters accordion section
 * is expanded (see panels-plan.md Decision #9, #13).
 *
 * See kupua/exploration/docs/panels-plan.md §Facet Filters for the full design.
 */

import { useEffect, useCallback } from "react";
import { useSearchStore } from "@/stores/search-store";
import { usePanelStore } from "@/stores/panel-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { FIELD_REGISTRY, type FieldDefinition } from "@/lib/field-registry";
import { findFieldTerm, upsertFieldTerm } from "@/lib/cql-query-edit";
import type { AggregationBucket } from "@/dal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aggregatable fields from the registry, ordered for display. */
const FACET_FIELDS: readonly FieldDefinition[] = FIELD_REGISTRY.filter(
  (f) => f.aggregatable && f.sortKey,
);

/** Max buckets shown before "show more" (matches AGG_DEFAULT_SIZE in store). */
const INITIAL_VISIBLE = 10;

// ---------------------------------------------------------------------------
// Compact count formatter (Decision #14)
// ---------------------------------------------------------------------------

function formatCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 10_000) return `${Math.round(n / 1_000)}k`;
  return n.toLocaleString();
}

// ---------------------------------------------------------------------------
// FacetFilters component
// ---------------------------------------------------------------------------

export function FacetFilters() {
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const aggregations = useSearchStore((s) => s.aggregations);
  const aggLoading = useSearchStore((s) => s.aggLoading);
  const aggCircuitOpen = useSearchStore((s) => s.aggCircuitOpen);
  const aggTook = useSearchStore((s) => s.aggTook);
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);
  const total = useSearchStore((s) => s.total);

  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const currentQuery = searchParams.query ?? "";

  // Fetch aggregations when Filters section is expanded and cache is stale.
  // Also re-fetches when search params change (total is a cheap proxy —
  // it changes on every new search).
  useEffect(() => {
    if (filtersExpanded) {
      fetchAggregations();
    }
  }, [filtersExpanded, fetchAggregations, total, currentQuery]);

  const handleFacetClick = useCallback(
    (cqlKey: string, value: string, e: React.MouseEvent) => {
      const negated = e.altKey; // Alt+click to exclude
      const existing = findFieldTerm(currentQuery, cqlKey, value);

      let newQuery: string;
      if (existing) {
        if (existing.negated === negated) {
          // Same polarity — remove the chip (toggle off)
          newQuery = (
            currentQuery.slice(0, existing.start) +
            currentQuery.slice(existing.end)
          )
            .trim()
            .replace(/\s{2,}/g, " ");
        } else {
          // Opposite polarity — flip it
          newQuery = upsertFieldTerm(currentQuery, cqlKey, value, negated);
        }
      } else {
        // Not present — add it
        newQuery = upsertFieldTerm(currentQuery, cqlKey, value, negated);
      }

      updateSearch({ query: newQuery || undefined });
    },
    [currentQuery, updateSearch],
  );

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------

  if (!aggregations && !aggLoading) {
    return (
      <div className="px-3 py-4 text-xs text-grid-text-dim">
        Expand this section to load filter counts.
      </div>
    );
  }

  return (
    <div className="py-1">
      {/* Timing + circuit breaker status */}
      <div className="px-3 pb-2 flex items-center gap-2 text-2xs text-grid-text-dim">
        {aggLoading && <span>Loading…</span>}
        {!aggLoading && aggTook != null && <span>{aggTook}ms</span>}
        {aggCircuitOpen && (
          <button
            onClick={() => fetchAggregations(true)}
            className="text-grid-accent hover:underline cursor-pointer"
          >
            Refresh (slow)
          </button>
        )}
      </div>

      {FACET_FIELDS.map((field) => (
        <FacetSection
          key={field.id}
          field={field}
          buckets={aggregations?.fields[field.sortKey!]?.buckets ?? []}
          currentQuery={currentQuery}
          onFacetClick={handleFacetClick}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// FacetSection — one field's values + counts
// ---------------------------------------------------------------------------

interface FacetSectionProps {
  field: FieldDefinition;
  buckets: AggregationBucket[];
  currentQuery: string;
  onFacetClick: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}

function FacetSection({ field, buckets, currentQuery, onFacetClick }: FacetSectionProps) {
  if (buckets.length === 0) return null;

  const cqlKey = field.cqlKey;
  if (!cqlKey) return null;

  const visibleBuckets = buckets.slice(0, INITIAL_VISIBLE);

  return (
    <div className="px-3 pb-2">
      {/* Field name header */}
      <div className="text-2xs text-grid-text-dim font-medium uppercase tracking-wide pb-1">
        {field.label}
      </div>

      {/* Value list */}
      <div className="flex flex-col gap-px">
        {visibleBuckets.map((bucket) => {
          const existing = findFieldTerm(currentQuery, cqlKey, bucket.key);
          const isActive = !!existing && !existing.negated;
          const isExcluded = !!existing && existing.negated;

          return (
            <button
              key={bucket.key}
              className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors text-left ${
                isActive
                  ? "bg-grid-accent/20 text-grid-accent"
                  : isExcluded
                    ? "bg-red-500/15 text-red-400 line-through"
                    : "text-grid-text hover:bg-grid-hover/30"
              }`}
              onClick={(e) => onFacetClick(cqlKey, bucket.key, e)}
              title={`${bucket.key} (${bucket.count.toLocaleString()})${isActive ? " — click to remove" : isExcluded ? " — click to remove exclusion" : "\nAlt+click to exclude"}`}
            >
              <span className="truncate min-w-0">{bucket.key}</span>
              <span className="text-2xs text-grid-text-dim shrink-0 tabular-nums">
                {formatCount(bucket.count)}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

