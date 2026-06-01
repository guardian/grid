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
 * See kupua/exploration/docs/zz Archive/panels-plan.md §Facet Filters for the full design.
 */

import { useEffect, useCallback, useRef } from "react";
import { useSearchStore } from "@/stores/search-store";
import { usePanelStore } from "@/stores/panel-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { useSearch } from "@tanstack/react-router";
import { FIELD_REGISTRY, type FieldDefinition } from "@/lib/field-registry";
import { findFieldTerm, upsertFieldTerm } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { ALT_CLICK } from "@/lib/keyboard-shortcuts";
import { trace } from "@/lib/perceived-trace";
import { formatCount } from "@/lib/format-count";
import { gridConfig } from "@/lib/grid-config";
import { findScrollParent } from "@/lib/dom-utils";
import type { AggregationBucket, TickerCountResult, AggregationsResult } from "@/dal";
import {
  PHOTOGRAPHER_CATEGORIES,
  ILLUSTRATOR_CATEGORIES,
} from "@/dal/adapters/elasticsearch/cql";
import { buildIsOptions } from "@/lib/typeahead-fields";

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
// AggCircuitBreaker — shows "Refresh (slow)" button when agg circuit is open.
// Rendered by search.tsx as AccordionSection's headerRight prop.
// ---------------------------------------------------------------------------

export function AggCircuitBreaker() {
  const aggCircuitOpen = useSearchStore((s) => s.aggCircuitOpen);
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);

  if (!aggCircuitOpen) return null;

  return (
    <button
      onClick={() => fetchAggregations(true)}
      className="text-grid-accent hover:underline cursor-pointer"
    >
      Refresh (slow)
    </button>
  );
}

// ---------------------------------------------------------------------------
// FacetFilters component
// ---------------------------------------------------------------------------

export function FacetFilters() {
  const filtersExpanded = usePanelStore((s) => s.isSectionOpen("left-filters"));
  const aggregations = useSearchStore((s) => s.aggregations);
  const tickerCounts = useSearchStore((s) => s.tickerCounts);
  const isFilterCounts = useSearchStore((s) => s.isFilterCounts);
  const fetchAggregations = useSearchStore((s) => s.fetchAggregations);
  const total = useSearchStore((s) => s.total);
  const expandedAggs = useSearchStore((s) => s.expandedAggs);
  const expandedAggsLoading = useSearchStore((s) => s.expandedAggsLoading);
  const fetchExpandedAgg = useSearchStore((s) => s.fetchExpandedAgg);
  const collapseExpandedAgg = useSearchStore((s) => s.collapseExpandedAgg);

  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const currentQuery = searchParams.query ?? "";

  // Scroll-anchor ref: when a facet value is clicked, we snapshot the
  // clicked button's viewport offset. After React re-renders with new agg
  // results (buckets may appear/disappear above), we restore the element's
  // position so the user doesn't experience a scroll jump.
  const scrollAnchorRef = useRef<{
    fieldPath: string;
    bucketKey: string;
    viewportY: number;
  } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // After aggregations change, restore scroll anchor if one was set.
  useEffect(() => {
    const anchor = scrollAnchorRef.current;
    if (!anchor) return;
    scrollAnchorRef.current = null;

    const container = containerRef.current;
    if (!container) return;
    const scroller = findScrollParent(container);
    if (!scroller) return;

    // Find the button that was clicked by its data attributes
    const btn = container.querySelector<HTMLElement>(
      `[data-facet-field="${CSS.escape(anchor.fieldPath)}"][data-facet-key="${CSS.escape(anchor.bucketKey)}"]`,
    );
    if (!btn) return;

    const currentY = btn.getBoundingClientRect().top;
    const drift = currentY - anchor.viewportY;
    if (Math.abs(drift) > 1) {
      scroller.scrollTop += drift;
    }
  }, [aggregations]);

  // Fetch aggregations when Filters section is expanded and cache is stale.
  // Also re-fetches when search params change (total is a cheap proxy —
  // it changes on every new search).
  useEffect(() => {
    if (filtersExpanded) {
      fetchAggregations();
    }
  }, [filtersExpanded, fetchAggregations, total, currentQuery]);

  const handleFacetClick = useCallback(
    (fieldPath: string, cqlKey: string, value: string, bucketKey: string, e: React.MouseEvent) => {
      trace("facet-click", "t_0", { field: cqlKey, value });
      // Snapshot the clicked button's viewport position for scroll anchoring
      const btn = e.currentTarget as HTMLElement;
      scrollAnchorRef.current = {
        fieldPath,
        bucketKey,
        viewportY: btn.getBoundingClientRect().top,
      };

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

  const hasFacetBuckets = FACET_FIELDS.some(
    (f) => (aggregations?.fields[f.esSearchPath as string]?.buckets?.length ?? 0) > 0,
  );

  return (
    <div ref={containerRef} className="py-1">
      {/* "Is" section — all valid is: values, with ticker counts where available.
          Iterates buildIsOptions() (config-gated canonical list) and annotates
          entries that have a corresponding ticker count from the store.
          No extra fetch — ticker counts come from countWithTickers filter aggs. */}
      <IsSection
        currentQuery={currentQuery}
        tickerCounts={tickerCounts}
        aggregations={aggregations}
        isFilterCounts={isFilterCounts}
        onIsClick={(value, negated) => {
          const existing = findFieldTerm(currentQuery, "is", value);
          let newQuery: string;
          if (existing && existing.negated === negated) {
            newQuery = (currentQuery.slice(0, existing.start) + currentQuery.slice(existing.end))
              .trim().replace(/\s{2,}/g, " ");
          } else {
            newQuery = upsertFieldTerm(currentQuery, "is", value, negated);
          }
          updateSearch({ query: newQuery || undefined });
        }}
      />
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
      {total === 0 && !hasFacetBuckets && (
        <div className="px-3 py-4 text-xs text-grid-text-dim text-center">
          No results to filter
        </div>
      )}
    </div>
  );
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
  onFacetClick: (fieldPath: string, cqlKey: string, value: string, bucketKey: string, e: React.MouseEvent) => void;
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
          // Exception: formatterIsDisplayOnly fields (category) use the raw
          // bucket key for CQL because the label differs from the ES keyword.
          const displayValue = field.formatter ? field.formatter(bucket.key) : bucket.key;
          const cqlValue = field.formatterIsDisplayOnly ? bucket.key : displayValue;
          const existing = findFieldTerm(currentQuery, cqlKey, cqlValue);
          const isActive = !!existing && !existing.negated;
          const isExcluded = !!existing && existing.negated;

          return (
            <button
              key={bucket.key}
              data-facet-field={field.esSearchPath as string}
              data-facet-key={bucket.key}
              className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors text-left ${
                isActive
                  ? "bg-grid-accent/20 text-grid-accent"
                  : isExcluded
                    ? "bg-red-500/15 text-red-400 line-through"
                    : "text-grid-text hover:bg-grid-hover/30"
              }`}
              onClick={(e) => onFacetClick(field.esSearchPath as string, cqlKey, cqlValue, bucket.key, e)}
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

// ---------------------------------------------------------------------------
// IsSection — "Is" filter section showing all valid is: values
// ---------------------------------------------------------------------------

/**
 * Pre-compute a lookup from is: value → ticker definition so we can find
 * the right backgroundColour and count without iterating tickerDefinitions
 * on every render.
 * "is:GNM-owned" → { name: "GNM-owned", backgroundColour: "#005689", ... }
 */
const IS_VALUE_TO_TICKER = new Map(
  gridConfig.tickerDefinitions
    .filter((d) => d.searchClause.startsWith("is:"))
    .map((d) => [d.searchClause.slice(3), d]),
);

interface IsSectionProps {
  currentQuery: string;
  tickerCounts: Record<string, TickerCountResult> | null;
  aggregations: AggregationsResult | null;
  isFilterCounts: Record<string, number> | null;
  onIsClick: (value: string, negated: boolean) => void;
}

function IsSection({ currentQuery, tickerCounts, aggregations, isFilterCounts, onIsClick }: IsSectionProps) {
  const isOptions = buildIsOptions();
  const org = gridConfig.staffPhotographerOrganisation;

  // Derive photo/illustration counts from the category terms agg (free — no extra ES call)
  const categoryBuckets = aggregations?.fields["usageRights.category"]?.buckets;
  const categoryCountMap = categoryBuckets
    ? new Map(categoryBuckets.map((b) => [b.key, b.count]))
    : null;
  const derivedIsCount = (value: string): number | undefined => {
    if (value === `${org}-owned-photo` && categoryCountMap) {
      return PHOTOGRAPHER_CATEGORIES.reduce((s, c) => s + (categoryCountMap.get(c) ?? 0), 0);
    }
    if (value === `${org}-owned-illustration` && categoryCountMap) {
      return ILLUSTRATOR_CATEGORIES.reduce((s, c) => s + (categoryCountMap.get(c) ?? 0), 0);
    }
    if (value === "deleted" || value === "under-quota") {
      return isFilterCounts?.[value];
    }
    return undefined;
  };

  // Pre-compute visible items to decide whether to render the section at all.
  const visibleItems = isOptions.filter((value) => {
    const existing = findFieldTerm(currentQuery, "is", value);
    const isActive = !!existing && !existing.negated;
    const isExcluded = !!existing && existing.negated;
    const tickerDef = IS_VALUE_TO_TICKER.get(value);
    const count = tickerDef && tickerCounts
      ? tickerCounts[tickerDef.name]?.value
      : derivedIsCount(value);
    return !(count === 0 && !isActive && !isExcluded);
  });

  if (visibleItems.length === 0) return null;

  return (
    <div className="pb-2">
      <div className="px-3 pt-2 pb-1 text-sm text-grid-text-muted">Is</div>
      <div className="flex flex-col gap-px px-3">
        {isOptions.map((value) => {
          const existing = findFieldTerm(currentQuery, "is", value);
          const isActive = !!existing && !existing.negated;
          const isExcluded = !!existing && existing.negated;

          const tickerDef = IS_VALUE_TO_TICKER.get(value);
          const count = tickerDef && tickerCounts
            ? tickerCounts[tickerDef.name]?.value
            : derivedIsCount(value);

          // Hide ticker-backed values with a known zero count, unless the
          // user has already applied it (they need to be able to remove it).
          if (count === 0 && !isActive && !isExcluded) return null;

          return (
            <button
              key={value}
              className={`flex items-center justify-between gap-2 px-1.5 py-0.5 rounded text-xs cursor-pointer transition-colors text-left ${
                isActive
                  ? "bg-grid-accent/20 text-grid-accent"
                  : isExcluded
                    ? "bg-red-500/15 text-red-400 line-through"
                    : "text-grid-text hover:bg-grid-hover/30"
              }`}
              onClick={(e) => onIsClick(value, e.altKey)}
              title={`is:${value}${count !== undefined ? ` (${count.toLocaleString()})` : ""}${isActive ? " — click to remove" : isExcluded ? " — click to remove exclusion" : `\n${ALT_CLICK} to exclude`}`}
            >
              <span className="flex items-center gap-1.5 min-w-0">
                <span className="truncate">{value}</span>
                {/* Colour swatch for ticker-backed values */}
                {tickerDef && (
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ backgroundColor: tickerDef.backgroundColour }}
                    aria-hidden="true"
                  />
                )}
              </span>
              {count !== undefined && (
                <span className="text-2xs text-grid-text-dim shrink-0 tabular-nums">
                  {formatCount(count)}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

