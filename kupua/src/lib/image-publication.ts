import type { Image } from "@/types/image";
import { attachedEnrichment, attachEnrichment, useEnrichmentStore, type EnrichmentFields } from "@/stores/enrichment-store";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { imageRatio, retainResultsGeometry } from "@/lib/result-geometry";
import type { ImageByIdResult, ImageDataSource } from "@/dal/types";
import { copyImageRead } from "@/lib/image-read-freshness";
import type { LabelObservation, LabelStandaloneOwner } from "@/lib/label-operation";

interface StandalonePublicationOwner extends LabelStandaloneOwner {
  publish: (image: Image) => void;
  token: object;
}

let standaloneOwner: StandalonePublicationOwner | undefined;
const fullOwners = new WeakMap<Image, object>();

export function ownStandalonePublication(owner: Omit<StandalonePublicationOwner, "token">): () => void {
  const registration = { ...owner, token: {} };
  standaloneOwner = registration;
  return () => { if (standaloneOwner === registration) standaloneOwner = undefined; };
}

export function createLabelReadback(source: Pick<ImageDataSource, "getByIds">): LabelObservation {
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

export function publishImages(entries: readonly ImageByIdResult[]): void {
  if (!entries.length) return;
  const { results } = useSearchStore.getState();
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
  if (nextResults && sameGeometry) retainResultsGeometry(results, nextResults);
  if (overlays.size) useEnrichmentStore.getState().upsertEnrichment(overlays);
  useSelectionStore.getState().publishSelectedMetadata([...publications.values()].map(entry => entry.image));
  if (nextResults) useSearchStore.setState({ results: nextResults });
  if (standaloneOwner?.isCurrent()) {
    const image = publications.get(standaloneOwner.imageId)?.image;
    if (image && fullOwners.get(image) === standaloneOwner.token) standaloneOwner.publish(image);
  }
}