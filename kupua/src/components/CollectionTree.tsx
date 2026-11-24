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

import { useState, useCallback, useContext, useEffect, useSyncExternalStore } from "react";
import { useStore } from "zustand";
import { useSearch } from "@tanstack/react-router";
import { collectionCountScope, useCollectionStore, type CollectionNode } from "@/stores/collection-store";
import { useSearchStore } from "@/stores/search-store";
import { useUpdateSearchParams } from "@/hooks/useUrlSearchSync";
import { findFieldTerm, upsertFieldTerm, removeAllFieldTerms } from "@/dal/adapters/elasticsearch/cql-query-edit";
import { formatCount } from "@/lib/format-count";
import { Chevron } from "./Chevron";
import { AccordionSection } from "./PanelLayout";
import { usePanelStore } from "@/stores/panel-store";
import { useImageDragSpringOpen } from "@/hooks/useImageDragSpringOpen";
import { MetadataEditorContext, useMetadataCommit } from "./MetadataEditing";
import { activeImageDrag, hasImageDrag, imageDragSignal, subscribeImageDrag, takeImageDrag } from "@/lib/internal-image-drag";
import { useBrowsingContext } from "@/lib/browsing-context";
import { useSelectionStore } from "@/stores/selection-store";
import "./CollectionTree.css";

// ---------------------------------------------------------------------------
// CollectionTree — top-level component
// ---------------------------------------------------------------------------

export function CollectionsSection() {
  const editor = useContext(MetadataEditorContext);
  const sectionId = "left-collections";
  const headerDragHandlers = useImageDragSpringOpen(
    () => editor.getState().connected && !usePanelStore.getState().isSectionOpen(sectionId),
    () => usePanelStore.getState().toggleSection(sectionId),
  );
  return <AccordionSection sectionId={sectionId} title="Collections" headerDragHandlers={headerDragHandlers}>
    <CollectionTree />
  </AccordionSection>;
}

export function CollectionTree() {
  const status = useCollectionStore((s) => s.status);
  const tree = useCollectionStore((s) => s.tree);

  const { path } = useBrowsingContext();
  const searchParams = useSearch({ from: path });
  const editor = useContext(MetadataEditorContext);
  const connected = useStore(editor, state => state.connected);
  const selected = useSelectionStore(state => path === "/search" && state.selectedIds.size > 0);
  const gesture = useSyncExternalStore(subscribeImageDrag, activeImageDrag);
  const [hover, setHover] = useState<{ signal?: AbortSignal; pathId?: string }>();
  const commit = useMetadataCommit();
  const dragging = !!gesture || (hover !== undefined && !hover.signal);
  const editSelection = selected && connected && !dragging ? (action: "add" | "remove", pathId: string) => {
    if (path !== "/search" || !editor.getState().connected || activeImageDrag()) return;
    const targetIds = [...useSelectionStore.getState().selectedIds];
    if (targetIds.length) commit({ fieldId: "collections", action, value: pathId, targetIds });
  } : undefined;
  const scope = collectionCountScope(searchParams);
  const counts = useCollectionStore((s) => s.countsByScope[scope]);
  const countRevision = useCollectionStore((s) => s.countRevision);
  const updateSearch = useUpdateSearchParams();
  const currentQuery = searchParams.query ?? "";

  // Mounted only while the panel and section are open: that is the request for counts.
  useEffect(() => {
    void useCollectionStore.getState().loadCounts(useSearchStore.getState().dataSource, scope);
  }, [scope, countRevision]);

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
    <div className="py-1" onDragOverCapture={event => {
      const signal = imageDragSignal(event.dataTransfer);
      const pathId = signal && event.target instanceof Element ? event.target.closest<HTMLElement>(".collection-tree-row")?.dataset.pathId : undefined;
      setHover(previous => previous && previous.signal === signal && previous.pathId === pathId ? previous : { signal, pathId });
    }} onDragLeaveCapture={event => {
      const row = event.target instanceof Element && event.target.closest(".collection-tree-row");
      if (row && event.relatedTarget instanceof Node && row.contains(event.relatedTarget)) return;
      setHover(undefined);
    }} onDropCapture={() => setHover(undefined)}>
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
          editSelection={editSelection}
          dropPath={connected && gesture && gesture === hover?.signal ? hover.pathId : undefined}
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
  counts: Record<string, number> | undefined;
  currentQuery: string;
  onNodeClick: (pathId: string) => void;
  editSelection?: (action: "add" | "remove", pathId: string) => void;
  dropPath?: string;
}

function CollectionTreeNode({
  node,
  depth,
  expanded,
  setExpanded,
  counts,
  currentQuery,
  onNodeClick,
  editSelection,
  dropPath,
}: CollectionTreeNodeProps) {
  const editor = useContext(MetadataEditorContext);
  const commit = useMetadataCommit();
  const pathId = node.data.data?.pathId ?? null;
  const hasChildren = node.data.children.length > 0;
  const nodeKey = pathId ?? node.data.basename;
  const isExpanded = expanded.has(nodeKey);
  const spring = useImageDragSpringOpen(
    () => hasChildren && !isExpanded && editor.getState().connected,
    () => setExpanded(prev => prev.has(nodeKey) ? prev : new Set(prev).add(nodeKey)),
  );

  // Active = this pathId is currently filtered in the query
  const isActive =
    pathId !== null &&
    findFieldTerm(currentQuery, "collection", pathId)?.negated === false;

  const count = pathId !== null && counts ? (Object.hasOwn(counts, pathId) ? counts[pathId] : 0) : null;

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
          "collection-tree-row flex items-center h-8 pr-1 select-none",
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
        data-path-id={pathId ?? undefined}
        data-drop-target={dropPath === pathId || undefined}
        onClick={pathId !== null ? () => onNodeClick(pathId) : undefined}
        onDragLeave={spring.onDragLeave}
        onDragOver={event => {
          spring.onDragOver(event);
          if (pathId === null || !editor.getState().connected || !hasImageDrag(event.dataTransfer)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDrop={event => {
          spring.onDrop();
          if (pathId === null) return;
          const targetIds = takeImageDrag(event.dataTransfer);
          if (!targetIds || !editor.getState().connected) return;
          event.preventDefault();
          event.stopPropagation();
          commit({ fieldId: "collections", action: "add", value: pathId, targetIds });
        }}
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
            <Chevron direction={isExpanded ? "down" : "right"} className="size-4 text-grid-text-dim" />
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
        {pathId !== null && editSelection && (["add", "remove"] as const).map(action => {
          const label = `${action === "add" ? "Add selected images to" : "Remove selected images from"} ${pathId}`;
          return <button key={action} type="button" className="collection-tree-action" aria-label={label} title={label}
            onClick={event => { event.stopPropagation(); editSelection(action, pathId); }}>
            {action === "add" ? "+" : "\u2212"}
          </button>;
        })}
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
              editSelection={editSelection}
              dropPath={dropPath}
            />
          ))}
        </div>
      )}
    </div>
  );
}
