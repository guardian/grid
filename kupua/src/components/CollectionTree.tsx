/**
 * CollectionTree — collapsible tree of Grid collections with image counts.
 *
 * Placed in the left panel ABOVE the Filters section. Reads the tree and
 * per-node subtree counts from collection-store.
 *
 * Click a node → injects `collection:pathId` into the current CQL query.
 * Clicking an active node removes the filter.
 *
 * Expand/collapse state is local (not persisted). Depth-0 nodes are sticky
 * while their subtrees scroll past.
 *
 * See kupua/exploration/docs/00 Architecture and philosophy/06-collections.md for architecture.
 */

import { useState, useCallback } from "react";
import { useSearch } from "@tanstack/react-router";
import { useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { findFieldTerm, upsertFieldTerm, removeAllFieldTerms } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { formatCount } from "@/lib/format-count";

// ---------------------------------------------------------------------------
// CollectionTree — top-level component
// ---------------------------------------------------------------------------

export function CollectionTree() {
  const status = useCollectionStore((s) => s.status);
  const tree = useCollectionStore((s) => s.tree);
  const counts = useCollectionStore((s) => s.counts);

  const searchParams = useSearch({ from: "/search" });
  const updateSearch = useUpdateSearchParams();
  const currentQuery = searchParams.query ?? "";

  // Local expand state — collapsed by default, keyed by pathId.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Handle click on a collection node name: toggle collection filter in query.
  // Sort auto-switching is handled atomically by useUpdateSearchParams() in useUrlSearchSync.ts.
  const handleNodeClick = useCallback(
    (pathId: string) => {
      const existing = findFieldTerm(currentQuery, "collection", pathId);

      // Already active — clicking the selected collection is a no-op.
      if (existing) return;

      // Remove any other collection filters first — collections are exclusive
      // (you can only browse one at a time, same as kahuna).
      const stripped = removeAllFieldTerms(currentQuery, "collection");
      const newQuery = upsertFieldTerm(stripped, "collection", pathId, false);

      updateSearch({ query: newQuery || undefined });
    },
    [currentQuery, updateSearch],
  );

  // Loading/idle — show a subtle placeholder so the section isn't empty.
  if (status === "idle" || status === "loading") {
    return (
      <div className="px-3 py-2 text-xs text-grid-text-dim">
        Loading collections…
      </div>
    );
  }

  if (!tree || tree.data.children.length === 0) {
    return (
      <div className="px-3 py-2 text-xs text-grid-text-dim">
        No collections found.
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.data.children.map((child) => (
        <CollectionTreeNode
          key={child.data.data?.pathId ?? child.data.basename}
          node={child}
          depth={0}
          expanded={expanded}
          setExpanded={setExpanded}
          counts={counts}
          currentQuery={currentQuery}
          onNodeClick={handleNodeClick}
        />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CollectionTreeNode — recursive single node
// ---------------------------------------------------------------------------

interface CollectionTreeNodeProps {
  node: CollectionNode;
  depth: number;
  expanded: Set<string>;
  setExpanded: React.Dispatch<React.SetStateAction<Set<string>>>;
  counts: Record<string, number>;
  currentQuery: string;
  onNodeClick: (pathId: string) => void;
}

function CollectionTreeNode({
  node,
  depth,
  expanded,
  setExpanded,
  counts,
  currentQuery,
  onNodeClick,
}: CollectionTreeNodeProps) {
  const pathId = node.data.data?.pathId ?? null;
  const hasChildren = node.data.children.length > 0;
  const nodeKey = pathId ?? node.data.basename;
  const isExpanded = expanded.has(nodeKey);

  // Active = this pathId is currently filtered in the query
  const isActive =
    pathId !== null &&
    findFieldTerm(currentQuery, "collection", pathId)?.negated === false;

  const count = pathId !== null ? (counts[pathId] ?? 0) : null;

  const handleToggle = useCallback(() => {
    if (isExpanded) {
      setExpanded((prev) => {
        const next = new Set(prev);
        next.delete(nodeKey);
        return next;
      });
    } else {
      setExpanded((prev) => new Set(prev).add(nodeKey));
    }
  }, [isExpanded, nodeKey, setExpanded]);

  // Depth-0 rows are sticky (first-pass: only depth-0 for simplicity)
  const isSticky = depth === 0 && isExpanded;

  return (
    <div>
      {/* Node row */}
      <div
        className={[
          "flex items-center h-8 pr-1 select-none",
          pathId !== null ? "cursor-pointer" : "",
          isSticky ? "sticky" : "",
          // Sticky rows need opaque backgrounds (content scrolls behind them).
          // Non-sticky rows can use semi-transparent Tailwind utilities.
          isSticky && isActive
            ? "bg-[color-mix(in_oklab,var(--color-grid-accent)_20%,var(--color-grid-bg))] text-grid-accent"
            : isSticky
              ? "bg-[var(--color-grid-bg)] text-grid-text hover:bg-[color-mix(in_oklab,var(--color-grid-hover)_30%,var(--color-grid-bg))]"
              : isActive
                ? "bg-grid-accent/20 text-grid-accent"
                : "hover:bg-grid-hover/30 text-grid-text",
        ]
          .filter(Boolean)
          .join(" ")}
        style={isSticky ? { top: 0, zIndex: 20 } : undefined}
        onClick={pathId !== null ? () => onNodeClick(pathId) : undefined}
      >
        {/* Left colour stripe — flush to left edge, no indent for subcollections */}
        <span
          className="self-stretch shrink-0"
          style={{
            width: 5,
            background: node.data.cssColour ?? "transparent",
          }}
        />

        {/* Content — depth-indented so stripe stays flush left */}
        <div
          className="flex items-center flex-1 min-w-0 gap-1"
          style={{ paddingLeft: 4 + depth * 12 }}
        >

        {/* Toggle chevron (parent) or spacer (leaf) */}
        {hasChildren ? (
          <button
            className="w-5 h-5 shrink-0 flex items-center justify-center hover:text-grid-accent cursor-pointer"
            onClick={(e) => { e.stopPropagation(); handleToggle(); }}
            aria-label={isExpanded ? "Collapse" : "Expand"}
          >
            <svg
              className="w-4 h-4 text-grid-text-dim"
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden="true"
            >
              {isExpanded ? (
                <path d="M16.59 8.59L12 13.17 7.41 8.59 6 10l6 6 6-6z" />
              ) : (
                <path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z" />
              )}
            </svg>
          </button>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        {/* Node name */}
        <span
          className="flex-1 overflow-clip text-ellipsis whitespace-nowrap text-left text-xs"
          title={node.data.basename}
        >
          {node.data.basename}
        </span>

        {/* Subtree count */}
        {count !== null && count > 0 && (
          <span className="text-2xs text-grid-text-dim tabular-nums ml-auto shrink-0">
            {formatCount(count)}
          </span>
        )}
        </div>
      </div>

      {/* Children */}
      {isExpanded && hasChildren && (
        <div>
          {node.data.children.map((child) => (
            <CollectionTreeNode
              key={child.data.data?.pathId ?? child.data.basename}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              setExpanded={setExpanded}
              counts={counts}
              currentQuery={currentQuery}
              onNodeClick={onNodeClick}
            />
          ))}
        </div>
      )}
    </div>
  );
}
