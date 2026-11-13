import type { Image } from "@/types/image";
import { attachedEnrichment, useEnrichmentStore, type EnrichmentFields } from "@/stores/enrichment-store";
import { useSelectionStore } from "@/stores/selection-store";
import { useSearchStore } from "@/stores/search-store";
import { getImageReadSequence, isImageMetadataCurrent, resolveImageOverlay } from "./image-read-freshness";
import { BATCH_POLICY } from "./batch-execution";
import { humanisePersistedReasons } from "./image-persistence";
import { isGridSessionInvalidated } from "./grid-api-instance";
import { getCropSettings, type CropSettings } from "./crop/crop-options";

export type ImageAction = "share" | "full-frame" | "download" | "delete" | "library";
export const IMAGE_ACTIONS: readonly ImageAction[] = ["share", "full-frame", "download", "delete", "library"];

export function imageHasFullFrame(image: Image): boolean {
  const dimensions = image.source?.orientedDimensions ?? image.source?.dimensions;
  return image.exports?.some(crop => {
    if ((crop.specification?.type ?? crop.type) === "full") return true;
    const bounds = crop.specification?.bounds as { x: number; y: number; width: number; height: number } | undefined;
    return Boolean(dimensions && bounds && bounds.x === 0 && bounds.y === 0
      && bounds.width === dimensions.width && bounds.height === dimensions.height);
  }) ?? false;
}

export interface ImageActionTarget {
  id: string;
  image?: Image;
  overlay?: EnrichmentFields;
  pending?: boolean;
}

export interface ImageActionContext {
  targets: readonly ImageActionTarget[];
  api: boolean;
  archive: boolean | null;
  pending?: boolean;
  cropSettings?: CropSettings;
}

export interface ImageActionDescription {
  label: string;
  shortLabel: string;
  reason?: string;
  pending?: boolean;
  operation: ImageAction | "archive" | "unarchive";
  eligibleIds: readonly string[];
  skipped: readonly { id: string; reason: string }[];
}

export interface PreparedImageAction {
  readonly operation: ImageActionDescription["operation"];
  readonly label: string;
  readonly targetIds: readonly string[];
  readonly eligibleIds: readonly string[];
  readonly skipped: readonly Readonly<{ id: string; reason: string }>[];
  readonly sharePath?: string;
  readonly commands: readonly Readonly<{
    imageId: string;
    method: "GET" | "POST" | "PUT" | "DELETE";
    resource: "crop" | "download" | "delete" | "archived";
    href?: string;
    body?: Readonly<Record<string, string | boolean>>;
  }>[];
}

export function prepareImageAction(action: ImageAction, context: ImageActionContext): PreparedImageAction | undefined {
  const description = describeImageAction(action, action === "full-frame" ? { ...context, cropSettings: getCropSettings() } : context);
  if (description.reason) return undefined;
  const commands: PreparedImageAction["commands"][number][] = [];
  const eligible = new Set(description.eligibleIds);
  for (const target of context.targets) {
    if (!eligible.has(target.id)) continue;
    const imageId = target.id;
    if (action === "full-frame") commands.push(Object.freeze({ imageId, method: "POST", resource: "crop",
      body: Object.freeze({ type: "full", source: target.overlay!.resource!.uri! }) }));
    else if (action === "download") commands.push(Object.freeze({ imageId, method: "GET", resource: "download",
      href: target.overlay!.resource!.links.find(link => link.rel === "download")!.href }));
    else if (action === "delete") commands.push(Object.freeze({ imageId, method: "DELETE", resource: "delete",
      href: target.overlay!.actions!.find(command => command.name === "delete" && command.method === "DELETE")!.href }));
    else if (action === "library") commands.push(Object.freeze({ imageId, method: "PUT", resource: "archived",
      body: Object.freeze({ data: description.operation === "archive" }) }));
  }
  return Object.freeze({ operation: description.operation, label: description.label,
    targetIds: Object.freeze(context.targets.map(target => target.id)),
    eligibleIds: Object.freeze([...description.eligibleIds]), skipped: Object.freeze(description.skipped.map(item => Object.freeze({ ...item }))),
    ...(action === "share" && { sharePath: `/search?${new URLSearchParams({ nonFree: "true", ids: context.targets.map(target => target.id).join(",") })}` }),
    commands: Object.freeze(commands) });
}

export function selectionImageActionContext(archive: boolean | null): ImageActionContext {
  const selection = useSelectionStore.getState();
  const search = useSearchStore.getState();
  const overlays = useEnrichmentStore.getState().data;
  return {
    api: import.meta.env.VITE_USE_MEDIA_API === "true", archive,
    pending: selection.isRangeWalking,
    targets: [...selection.selectedIds].map(id => {
      const position = search.imagePositions.get(id);
      const cached = selection.metadataCache.get(id);
      const buffered = position === undefined ? undefined : search.results[position - search.bufferOffset];
      const resident = buffered?.id === id ? buffered : undefined;
      const image = cached && resident ? getImageReadSequence(resident) > getImageReadSequence(cached) ? resident : cached : cached ?? resident;
      const attached = image ? attachedEnrichment(image) : undefined;
      const stored = overlays.get(id);
      const candidates = getImageReadSequence(stored) > getImageReadSequence(attached) ? [stored, attached] : [attached, stored];
      const overlay = image ? resolveImageOverlay(image, ...candidates) : stored;
      return { id, image, overlay, pending: selection.pendingFetchIds.has(id)
        || Boolean(image && !isImageMetadataCurrent(image, overlay)) };
    }),
  };
}

export function describeImageAction(action: ImageAction, context: ImageActionContext): ImageActionDescription {
  const targets = context.targets;
  const labels = {
    share: ["Share with URL", "Share"], "full-frame": ["Crop full frame", "Full frame"],
    download: ["Download", "Download"], delete: ["Delete", "Delete"], library: ["Add to Library", "Library"],
  } as const;
  const result: ImageActionDescription = { label: labels[action][0], shortLabel: labels[action][1], operation: action,
    eligibleIds: targets.map(target => target.id), skipped: [] };
  const blocked = (reason: string, pending = false): ImageActionDescription => ({ ...result, reason, ...(pending && { pending: true }), eligibleIds: [] });
  if (!targets.length) return blocked("No images selected");
  if (context.pending) return blocked("Selection is still changing", true);
  if (action === "share") return result;
  if (!context.api) return blocked("Available in media-api mode only");
  if (isGridSessionInvalidated()) return blocked("Reload after signing in again");
  const knownUnavailable = (target: ImageActionTarget) => Boolean(target.image?.__availability || target.image?.softDeletedMetadata);
  if (targets.some(target => !(action === "full-frame" && knownUnavailable(target))
    && (target.pending || !target.image || !target.overlay))) return blocked("Image information is not ready",
      targets.some(target => target.pending && !(action === "full-frame" && knownUnavailable(target))));
  if (action !== "download" && targets.length > BATCH_POLICY.maxTargets) return blocked(`Select at most ${BATCH_POLICY.maxTargets} images`);
  const unavailable = targets.some(target => target.image!.__availability || target.image!.softDeletedMetadata);
  if (action === "full-frame") {
    if ((context.cropSettings ?? getCropSettings()).lockedType !== undefined) return blocked("Use Crop image for the requested crop ratio");
    if (targets.some(target => !knownUnavailable(target) && !Array.isArray(target.image!.exports))) return blocked("Crop information is not ready");
    const skipped: { id: string; reason: string }[] = [];
    const eligibleIds = targets.filter(target => {
      const reason = target.image!.__availability || target.image!.softDeletedMetadata ? "Image unavailable"
        : imageHasFullFrame(target.image!) ? "Already has a full frame"
        : target.overlay!.valid === false || !target.overlay!.resource?.uri || !target.overlay!.resource.links.some(link => link.rel === "crops") ? "Cannot crop this image" : undefined;
      if (reason) skipped.push({ id: target.id, reason });
      return !reason;
    }).map(target => target.id);
    const skipSummary = targets.length === 1 ? skipped[0]?.reason : [...new Set(skipped.map(item => item.reason))]
      .map(reason => `${skipped.filter(item => item.reason === reason).length}: ${reason}`).join("; ");
    return { ...result, eligibleIds, skipped, ...(!eligibleIds.length && { reason: skipSummary }) };
  }
  if (unavailable) return blocked(targets.length === 1 ? "This image is unavailable or deleted" : "One or more selected images are unavailable or deleted");
  if (action === "delete") {
    if (targets.some(target => !target.overlay!.actions?.some(command => command.name === "delete" && command.method === "DELETE"))) {
      return blocked(targets.length === 1 ? "This image cannot be deleted" : "Not all selected images can be deleted");
    }
  }
  if (action === "download" && targets.some(target => !target.overlay!.resource?.links.some(link => link.rel === "download"))) {
    return blocked(targets.length === 1 ? "This image is not available to download" : "Not all selected images are available to download");
  }
  if (action === "library") {
    if (targets.some(target => !target.overlay!.persisted)) return blocked("Library information is not ready");
    const noneCanChange = targets.every(target => {
      const persisted = target.overlay!.persisted!;
      return persisted.value && !(persisted.reasons.length === 1 && persisted.reasons[0] === "archived");
    });
    if (noneCanChange) {
      const reasons = [...new Set(targets.flatMap(target => target.overlay!.persisted!.reasons))];
      return { ...result, label: "Kept in Library", eligibleIds: [],
        reason: `Kept in Library because ${targets.length === 1 ? "the image has" : "the images have"} been ${humanisePersistedReasons(reasons, targets.length === 1 ? "and" : "or")}.` };
    }
    const remove = targets.every(target => target.overlay!.persisted!.value);
    result.label = remove ? "Remove from Library" : "Add to Library";
    result.operation = remove ? "unarchive" : "archive";
    if (context.archive !== true) return blocked(context.archive === null ? "Library permission is loading" : "Library permission unavailable", context.archive === null);
    result.eligibleIds = targets.filter(target => Boolean(target.image!.userMetadata?.archived) === remove).map(target => target.id);
  }
  return result;
}