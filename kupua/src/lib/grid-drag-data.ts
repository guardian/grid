import type { Image } from "@/types/image";
import type { Crop, Link } from "@/dal/grid-api/types";
import { gridServiceOrigin, gridServiceUrl } from "@/dal/grid-api/proxy-target";
import { serviceLink } from "./grid-api-instance";
import { BUILT_IN_CROP_OPTIONS, FREEFORM, LEGACY_CROP_PARAM_KEYS } from "./crop/crop-options";

export function canonicalDragCrops(resource: NonNullable<Image["__dragResource"]>, list: { data?: Crop[]; links?: Link[] }): Map<string, Crop> {
  const result = new Map<string, Crop>();
  if (!Array.isArray(list?.data) || !Array.isArray(list.links) || !list.links.some(link => link.rel === "image" && link.href === resource.uri)) return result;
  const downloads = new Map(list.links.map(link => [link.rel, link.href]));
  for (const crop of list.data) {
    if (!crop?.id || crop.specification?.uri !== resource.uri || !crop.master || !Array.isArray(crop.assets) || !crop.assets.length || !crop.assets.every(asset => asset?.dimensions?.width && asset.dimensions.height)) continue;
    const assets = crop.assets.map(asset => ({ ...asset, downloadLink: downloads.get(`crop-download-${crop.id}-${asset.dimensions!.width}`) }))
      .sort((left, right) => left.dimensions!.width * left.dimensions!.height - right.dimensions!.width * right.dimensions!.height);
    if (!resource.data.exports?.some(saved => saved.id === crop.id && Array.isArray(saved.assets) && saved.assets.every(asset => assets.some(actual => actual.dimensions!.width === asset.dimensions?.width)))) continue;
    const largest = assets.reduce((best, asset) => asset.dimensions!.width > best.dimensions!.width ? asset : best);
    const canonical = { ...crop, assets, downloadLink: largest.downloadLink };
    result.set(crop.id, canonical);
  }
  return result;
}

export async function readGridDragCrops(resource: NonNullable<Image["__dragResource"]>, signal: AbortSignal) {
  const path = `/crops/${encodeURIComponent(resource.data.id)}`;
  const origin = resource.crops && gridServiceOrigin(resource.crops, path);
  if (!resource.crops || !origin || origin !== gridServiceOrigin(await serviceLink("cropper"))) return undefined;
  const target = gridServiceUrl("cropper", resource.crops, path, origin);
  if (!target) return undefined;
  const response = await fetch(target, { signal, credentials: "include", redirect: "error", headers: { Accept: "application/json" } });
  return response.ok ? canonicalDragCrops(resource, await response.json()) : undefined;
}

export function writeGridImageDragData(transfer: Pick<DataTransfer, "setData">, image: Image,
  { selected = false, crop, detail = false }: { selected?: boolean; crop?: Crop; detail?: boolean } = {}): boolean {
  const resource = image.__dragResource;
  if (!resource || resource.data.id !== image.id) return false;
  const { uri, data, ui } = resource;
  let route: URL;
  try { route = new URL(ui); } catch { return false; }
  if (!/^https?:$/.test(route.protocol) || route.username || route.password || route.search || route.hash) return false;
  const query: string[] = [];
  let asset = data.thumbnail;
  if (crop) {
    if (!crop.id || !crop.assets?.length || crop.specification?.uri !== uri) return false;
    asset = crop.assets[0];
    query.push(`crop=${encodeURIComponent(crop.id)}`);
  }
  if (detail) {
    const params = new URLSearchParams(window.location.search);
    for (const key of LEGACY_CROP_PARAM_KEYS) {
      const value = params.get(key);
      if (value) query.push(`${key}=${encodeURIComponent(value)}`);
    }
  }
  route.search = query.join("&");
  const thumbnail = asset?.secureUrl || asset?.file;
  if (!thumbnail) return false;
  const aspectRatio = crop?.specification?.aspectRatio;
  const cropType = aspectRatio ? (BUILT_IN_CROP_OPTIONS.find(option => option.ratioString === aspectRatio) ?? FREEFORM).key : undefined;
  transfer.setData("application/vnd.mediaservice.image+json", JSON.stringify({ data, uri }));
  transfer.setData("application/vnd.mediaservice.kahuna.uri", ui);
  transfer.setData("application/vnd.asset-handle+json", JSON.stringify({ source: "grid", sourceType: crop ? "crop" : "original", thumbnail, embeddableUrl: route.href, aspectRatio, cropType }));
  transfer.setData("text/plain", uri);
  transfer.setData("text/uri-list", uri);
  if (crop) transfer.setData("application/vnd.mediaservice.crops+json", JSON.stringify(crop));
  if (selected) transfer.setData("application/vnd.mediaservice.images+json", JSON.stringify([{ data }]));
  return true;
}