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

import { useEffect, useCallback, useRef } from "react";
import { useSearchStore } from "@/stores/search-store";
import { usePanelStore } from "@/stores/panel-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { FIELD_REGISTRY, type FieldDefinition } from "@/lib/field-registry";
import { findFieldTerm, upsertFieldTerm } from "@/lib/cql-query-edit";
import { ALT_CLICK } from "@/lib/keyboard-shortcuts";
import type { AggregationBucket } from "@/dal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Aggregatable fields from the registry, ordered for display. */
const FACET_FIELDS: readonly FieldDefinition[] = FIELD_REGISTRY.filter(
  (f) => f.aggregatable && f.esSearchPath && typeof f.esSearchPath === "string",
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
// AggTiming — shows ms counter in the section header (right side).
// Rendered by search.tsx as AccordionSection's headerRight prop.
// Only visible once a real value has been received.
// ---------------------------------------------------------------------------

export function AggTiming() {
  const aggLoading = useSearchStore((s) => s.aggLoading);
  const aggTook = useSearchStore((s) => s.aggTook);
  const aggCircuitOpen = useSearchStore((s) => s.aggCircuitOpen);
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);

  if (aggCircuitOpen) {
    return (
      <button
        onClick={() => fetchAggregations(true)}
        className="text-grid-accent hover:underline cursor-pointer"
      >
        Refresh (slow)
      </button>
    );
  }

  if (aggLoading) return <span>…</span>;
  if (aggTook != null) return <span>{aggTook}ms</span>;
  return null;
}

// ---------------------------------------------------------------------------
// FacetFilters component
// ---------------------------------------------------------------------------

export function FacetFilters() {
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const aggregations = useSearchStore((s) => s.aggregations);
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);
  const total = useSearchStore((s) => s.total);
  const expandedAggs = useSearchStore((s) => s.expandedAggs);
  const expandedAggsLoading = useSearchStore((s) => s.expandedAggsLoading);
  const fetchExpandedAgg = useSearchStore((s) => s.fetchExpandedAgg);
  const collapseExpandedAgg = useSearchStore((s) => s.collapseExpandedAgg);

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

  return (
    <div className="py-1">
      {FACET_FIELDS.map((field) => (
        <FacetSection
          key={field.id}
          field={field}
          buckets={aggregations?.fields[field.esSearchPath as string]?.buckets ?? []}
          expandedBuckets={expandedAggs[field.esSearchPath as string]?.buckets}
          expandedLoading={expandedAggsLoading.has(field.esSearchPath as string)}
          onShowMore={() => fetchExpandedAgg(field.esSearchPath as string)}
          onCollapse={() => collapseExpandedAgg(field.esSearchPath as string)}
          currentQuery={currentQuery}
          onFacetClick={handleFacetClick}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Scroll anchor helper — find the nearest scrollable ancestor
// ---------------------------------------------------------------------------

function findScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowY } = getComputedStyle(node);
    if (overflowY === "scroll" || overflowY === "auto") return node;
    node = node.parentElement;
  }
  return null;
}

// ---------------------------------------------------------------------------
// FacetSection — one field's values + counts
// ---------------------------------------------------------------------------

interface FacetSectionProps {
  field: FieldDefinition;
  buckets: AggregationBucket[];
  expandedBuckets: AggregationBucket[] | undefined;
  expandedLoading: boolean;
  onShowMore: () => void;
  onCollapse: () => void;
  currentQuery: string;
  onFacetClick: (cqlKey: string, value: string, e: React.MouseEvent) => void;
}

function FacetSection({
  field, buckets, expandedBuckets, expandedLoading,
  onShowMore, onCollapse, currentQuery, onFacetClick,
}: FacetSectionProps) {
  const headerRef = useRef<HTMLDivElement>(null);

  if (buckets.length === 0) return null;

  const cqlKey = field.cqlKey;
  if (!cqlKey) return null;

  const isExpanded = !!expandedBuckets;
  const visibleBuckets = isExpanded ? expandedBuckets : buckets.slice(0, INITIAL_VISIBLE);

  // Show "more" link when the batch returned exactly INITIAL_VISIBLE buckets
  // (there are likely more) and we haven't expanded yet.
  const hasMore = !isExpanded && buckets.length >= INITIAL_VISIBLE;

  // Scroll-anchored collapse: after collapsing the expanded bucket list,
  // scroll so this field's header is at the top of the panel. Without this,
  // the user clicks "Show fewer" at the bottom of a long list and ends up
  // staring at whatever section was below — completely lost.
  const handleCollapse = () => {
    const header = headerRef.current;
    const scroller = header && findScrollParent(header);
    onCollapse();
    if (header && scroller) {
      requestAnimationFrame(() => {
        const scrollerRect = scroller.getBoundingClientRect();
        const headerRect = header.getBoundingClientRect();
        scroller.scrollTop += headerRect.top - scrollerRect.top;
      });
    }
  };

  return (
    <div className="pb-2">
      {/* Field name — sub-section header, no divider */}
      <div ref={headerRef} className="px-3 pt-2 pb-1 text-sm text-grid-text-muted">
        {field.label}
      </div>

      {/* Value list */}
      <div className="flex flex-col gap-px px-3">
        {visibleBuckets.map((bucket) => {
          // Apply formatter for display (e.g. "image/jpeg" → "jpeg").
          // The formatted value is also used as the CQL click value —
          // fileType:jpeg is what CQL expects (translateMimeType handles
          // short names → full MIME). Using the raw ES value would produce
          // fileType:image/jpeg which CQL can't translate.
          const displayValue = field.formatter ? field.formatter(bucket.key) : bucket.key;
          const existing = findFieldTerm(currentQuery, cqlKey, displayValue);
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
              onClick={(e) => onFacetClick(cqlKey, displayValue, e)}
              title={`${displayValue} (${bucket.count.toLocaleString()})${isActive ? " — click to remove" : isExcluded ? " — click to remove exclusion" : `\n${ALT_CLICK} to exclude`}`}
            >
              <span className="truncate min-w-0">{displayValue}</span>
              <span className="text-2xs text-grid-text-dim shrink-0 tabular-nums">
                {formatCount(bucket.count)}
              </span>
            </button>
          );
        })}

        {/* Show more / Show less toggle */}
        {hasMore && (
          <button
            className="text-2xs text-grid-text-dim hover:text-grid-accent cursor-pointer pt-0.5 text-left px-1.5"
            onClick={onShowMore}
            disabled={expandedLoading}
          >
            {expandedLoading ? "Loading…" : "Show more…"}
          </button>
        )}
        {isExpanded && (
          <button
            className="text-2xs text-grid-text-dim hover:text-grid-accent cursor-pointer pt-0.5 text-left px-1.5"
            onClick={handleCollapse}
          >
            Show fewer
          </button>
        )}
      </div>
    </div>
  );
}

