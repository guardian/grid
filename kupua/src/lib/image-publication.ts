import type { Image } from "@/types/image";
import { attachedEnrichment, attachEnrichment, useEnrichmentStore, type EnrichmentFields } from "@/stores/enrichment-store";
import { getSearchGeneration, useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { imageRatio, retainResultsGeometry } from "@/lib/result-geometry";
import type { ImageByIdResult, ImageDataSource } from "@/dal/types";
import { copyImageRead, getImageAvailability, getImageReadSequence, getOrderingRevision, recordImageAvailability, unavailableImage } from "@/lib/image-read-freshness";
import type { MetadataEditObservation, MetadataEditStandaloneOwner } from "@/lib/metadata-edit-execution";
import { mountedResultsFitViewport } from "@/lib/scroll-container-ref";

interface StandalonePublicationOwner extends MetadataEditStandaloneOwner {
  publish: (image: Image) => void;
  /** The image standalone Detail currently shows, if any. */
  current?: () => Image | undefined;
  publishUnavailable?: (state: NonNullable<Image["__availability"]>) => void;
  token: object;
}

let standaloneOwner: StandalonePublicationOwner | undefined;
const fullOwners = new WeakMap<Image, object>();

export function ownStandalonePublication(owner: Omit<StandalonePublicationOwner, "token">): () => void {
  const registration = { ...owner, token: {} };
  standaloneOwner = registration;
  return () => { if (standaloneOwner === registration) standaloneOwner = undefined; };
}

/** True when results, selection or standalone Detail already hold a later read of this image. */
export function hasNewerImageCopy(image: Image): boolean {
  const search = useSearchStore.getState();
  const position = search.imagePositions.get(image.id);
  const resident = position === undefined ? undefined : search.results[position - search.bufferOffset];
  const standalone = standaloneOwner?.imageId === image.id && standaloneOwner.isCurrent() ? standaloneOwner.current?.() : undefined;
  return [resident, useSelectionStore.getState().metadataCache.get(image.id), standalone]
    .some(copy => copy?.id === image.id && getImageReadSequence(copy) > getImageReadSequence(image));
}

/** Lets a read issued for another purpose also refresh standalone Detail, if it still shows that image. */
export function tagStandalonePublication(result: ImageByIdResult | undefined) {
  const owner = standaloneOwner;
  if (result && owner?.imageId === result.image.id && owner.isCurrent()) fullOwners.set(result.image, owner.token);
  return result;
}

export async function readForStandalonePublication(imageId: string, read: () => Promise<ImageByIdResult | undefined>) {
  const current = () => standaloneOwner?.imageId === imageId && standaloneOwner.isCurrent() ? standaloneOwner : undefined;
  if (!current()) return;
  const result = await read();
  const owner = current();
  if (!owner || result?.image.id !== imageId) return;
  fullOwners.set(result.image, owner.token);
  return result;
}

export function createLabelReadback(source: Pick<ImageDataSource, "getByIds">): MetadataEditObservation {
  return {
    readImages: (ids, signal) => source.getByIds(ids, signal),
    standalone: () => {
      const owner = standaloneOwner;
      return owner && { ...owner, read: async signal => {
        const image = await owner.read(signal);
        if (image) fullOwners.set(image, owner.token);
        return image;
      } };
    },
    publicationReady: image => {
      if (!standaloneOwner || standaloneOwner.imageId !== image.id || fullOwners.get(image) === standaloneOwner.token) return true;
      standaloneOwner.unavailable();
      return true;
    },
    publishImages: images => publishImages(images.map(image => ({ image, enrichment: attachedEnrichment(image) }))),
  };
}

export function publishImage(
  image: Image,
  overlay: EnrichmentFields,
): void {
  publishImages([{ image, enrichment: overlay }]);
}

export function publishUnavailableImages(ids: readonly string[], availability: NonNullable<Image["__availability"]>): void {
  if (!ids.length) return;
  recordImageAvailability(ids, availability);
  const { results } = useSearchStore.getState();
  const selected = useSelectionStore.getState();
  const resident = new Map(results.filter(image => image !== undefined).map(image => [image.id, image]));
  publishImages([...new Set(ids)].map(id => ({
    image: unavailableImage(id, getImageAvailability(id)!, resident.get(id) ?? selected.metadataCache.get(id)),
    enrichment: { resource: { links: [] }, actions: [] },
  })));
  if (standaloneOwner?.isCurrent() && ids.includes(standaloneOwner.imageId)) {
    standaloneOwner.publishUnavailable?.(getImageAvailability(standaloneOwner.imageId)!);
  }
}

export function publishImages(entries: readonly ImageByIdResult[]): void {
  if (!entries.length) return;
  const state = useSearchStore.getState();
  const { results } = state;
  const publications = new Map(entries.map(entry => [entry.image.id, entry]));
  const retainedEnrichment = useEnrichmentStore.getState().data;
  const overlays = new Map<string, EnrichmentFields>();
  let nextResults: typeof results | undefined;
  let sameGeometry = true;
  for (let index = 0; index < results.length; index++) {
    const previous = results[index];
    const entry = previous && publications.get(previous.id);
    if (!entry || !previous) continue;
    const image = previous.__aiScore === undefined ? entry.image : { ...entry.image, __aiScore: previous.__aiScore };
    if (image !== entry.image) copyImageRead(entry.image, image);
    publications.set(image.id, { ...entry, image });
    if (previous !== image) {
      nextResults ??= results.slice();
      nextResults[index] = image;
      sameGeometry &&= imageRatio(previous) === imageRatio(image);
    }
    if (entry.enrichment) overlays.set(image.id, entry.enrichment);
  }
  for (const { image, enrichment } of publications.values()) {
    if (!enrichment) continue;
    attachEnrichment(image, enrichment);
    if (retainedEnrichment.has(image.id)) overlays.set(image.id, enrichment);
  }
  const compact = entries.some(entry => entry.image.__availability === "deleted")
    && nextResults?.some(image => image?.__availability === "deleted")
    && !state.loading && state.bufferOffset === 0 && results.length === state.total && state._displayEnd <= state.total
    && results.every(image => image !== undefined)
    && mountedResultsFitViewport(results.map(image => image!.id));
  if (compact) nextResults = nextResults!.filter(image => image?.__availability !== "deleted");
  if (nextResults && sameGeometry && !compact) retainResultsGeometry(results, nextResults);
  if (overlays.size) useEnrichmentStore.getState().upsertEnrichment(overlays);
  useSelectionStore.getState().publishSelectedMetadata([...publications.values()].map(entry => entry.image));
  if (nextResults) {
    const positions = compact ? new Map(nextResults.map((image, index) => [image!.id, index])) : state.imagePositions;
    useSearchStore.setState({ results: nextResults, ...(compact && {
      imagePositions: positions, total: nextResults.length, _displayEnd: 0,
      _terminalEnd: state.endCursor ? { cursor: state.endCursor, position: nextResults.length,
        searchGeneration: getSearchGeneration(), orderingRevision: getOrderingRevision() } : null,
      focusedImageId: state.focusedImageId && positions.has(state.focusedImageId) ? state.focusedImageId : null,
      _focusedImageKnownOffset: state.focusedImageId ? positions.get(state.focusedImageId) ?? null : null,
    }) });
  }
  if (standaloneOwner?.isCurrent()) {
    const image = publications.get(standaloneOwner.imageId)?.image;
    if (image && fullOwners.get(image) === standaloneOwner.token) standaloneOwner.publish(image);
  }
}