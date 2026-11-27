import type { EnrichedImage } from "@/lib/derive-enriched-image";
import { humanisePersistedReasons } from "@/lib/image-persistence";
import { LibraryIcon, libraryStatusIcon } from "./LibraryIcon";

export type InlineLibrary = boolean | "busy";
export function ResultLibraryBadge({ image, editable }: { image: EnrichedImage; editable: InlineLibrary }) {
  const persisted = image.persisted;
  if (!persisted) return null;
  const status = persisted.value ? libraryStatusIcon(persisted.reasons) : undefined;
  const title = persisted.value ? `Kept in Library because the image has been ${humanisePersistedReasons(persisted.reasons)}.` : undefined;
  const passive = status && <span className="result-library-status text-grid-text-dim" title={title}><LibraryIcon variant={status} size={14} /></span>;
  if (!editable || status === "locked" || image.metadataStale || image.softDeletedMetadata || image.userMetadata?.archived !== persisted.value) return passive ?? null;
  const label = status ? "Remove from Library" : "Add to Library";
  return <span className="result-library-slot" key={image.id}>
    {passive}
    <button type="button" disabled={editable === "busy"} aria-busy={editable === "busy" || undefined} data-inline-library={status ? "unarchive" : "archive"} data-library-image={image.id} aria-label={label} title={editable === "busy" ? "Saving Library change" : label}>
      <LibraryIcon variant={status ?? "add"} size={14} />
      {status && <LibraryIcon variant="remove" size={14} />}
    </button>
  </span>;
}