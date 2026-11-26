import type { Image } from "@/types/image";
import type { EnrichedImage } from "@/lib/derive-enriched-image";
import { PILL_ACCENT, PILL_ACTION_ICONS, PILL_BASE } from "./SearchPill";
import { useSelectionStore } from "@/stores/selection-store";

export function ResultPillStrip({ image, enriched, family, colours, onSearch }: {
  image: Image; enriched?: EnrichedImage; family?: "labels" | "collections"; colours?: Record<string, string>;
  onSearch?: (key: string, value: string, event: React.MouseEvent) => void;
}) {
  const labels = family !== "collections" && image.userMetadata?.labels;
  const collections = family !== "labels" && image.collections;
  const canAdd = family !== "collections" && !image.softDeletedMetadata && !image.__availability && !enriched?.metadataStale && enriched?.resource?.links.some(link => link.rel === "edits" && link.href);
  const pill = (key: "label" | "collection", value: string, display: string, title: string, colour?: string) => (
    <button key={value} type="button" data-result-pill data-search-pill data-cql-key={key} data-cql-value={value} title={title}
      className={(key === "label" ? PILL_ACCENT : PILL_BASE) + " result-value"} style={key === "collection" ? { backgroundColor: colour ?? "#555", color: "white" } : undefined}
      disabled={value.includes('"')} onClick={onSearch ? event => {
        if (useSelectionStore.getState().selectedIds.size && event.currentTarget.closest('[data-selection-mode="true"]')) return;
        event.stopPropagation(); onSearch(key, value, event);
      } : undefined}>{display}</button>);
  return <div className="result-pill-strip" data-grid-strip={!family || undefined} onDoubleClick={event => { if ((event.target as Element).closest("button")) event.stopPropagation(); }} onMouseDown={event => {
    if ((event.target as Element).closest("[data-result-pill]") && !event.currentTarget.closest('[data-selection-mode="true"]')) event.preventDefault();
  }}>
    {!!labels && labels.length > 0 && <span className="result-pill-family">{labels.slice(0, 4).map(value => pill("label", value, value, value))}</span>}
    {!!collections && collections.length > 0 && <span className="result-pill-family">{collections.slice(0, 4).map(col => col.pathId && pill("collection", col.pathId, col.path?.at(-1) ?? col.pathId.split("/").at(-1)!, col.path?.join(" ▸ ") ?? col.pathId, colours?.[col.pathId]))}</span>}
    {canAdd && <button type="button" data-result-label-add={image.id} title="Add labels to this image" aria-label="Add labels to this image" className="result-label-plus">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d={PILL_ACTION_ICONS.addBox} /></svg>
    </button>}
  </div>;
}