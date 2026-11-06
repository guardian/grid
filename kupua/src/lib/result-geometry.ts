import type { Image } from "@/types/image";

type Results = readonly (Image | undefined)[];
const geometryIdentities = new WeakMap<Results, object>();

export function resultsGeometryIdentity(results: Results): object {
  let identity = geometryIdentities.get(results);
  if (!identity) {
    identity = {};
    geometryIdentities.set(results, identity);
  }
  return identity;
}

export function retainResultsGeometry(previous: Results, next: Results): void {
  geometryIdentities.set(next, resultsGeometryIdentity(previous));
}

export function imageRatio(image: Image): number {
  const dimensions = image.source?.orientedDimensions ?? image.source?.dimensions;
  const { width, height } = dimensions ?? {};
  return typeof width === "number" && typeof height === "number" && Number.isFinite(width) && Number.isFinite(height)
    && width > 0 && height > 0 ? width / height : 1;
}