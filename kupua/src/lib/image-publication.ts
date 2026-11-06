import type { Image } from "@/types/image";
import { attachEnrichment, useEnrichmentStore, type EnrichmentFields } from "@/stores/enrichment-store";
import { useSearchStore } from "@/stores/search-store";
import { useSelectionStore } from "@/stores/selection-store";
import { imageRatio, retainResultsGeometry } from "@/lib/result-geometry";

export function publishImage(
  image: Image,
  overlay: EnrichmentFields,
): void {
  const { results } = useSearchStore.getState();
  const index = results.findIndex(candidate => candidate?.id === image.id);
  attachEnrichment(image, overlay);
  if (index >= 0) {
    const nextResults = results.slice();
    nextResults[index] = image;
    if (imageRatio(results[index]!) === imageRatio(image)) retainResultsGeometry(results, nextResults);
    useSearchStore.setState({ results: nextResults });
  }
  if (index >= 0 || useEnrichmentStore.getState().data.has(image.id)) {
    useEnrichmentStore.getState().upsertEnrichment(new Map([[image.id, overlay]]));
  }
  useSelectionStore.getState().publishSelectedMetadata([image]);
}