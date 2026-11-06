import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { GridCommandResult } from "./grid-commands";

interface ReadEvidence {
  issued: number;
  projection: "lean" | "full";
  version?: number;
}

interface ImageFact {
  operation: number;
  command: "submitted" | GridCommandResult["outcome"];
  hasFloor: boolean;
  floor?: number;
  acceptedRead: number;
  authorityRead: number;
}

const facts = new Map<string, ImageFact>();
const evidence = new WeakMap<object, ReadEvidence>();
const unavailableAuthority: EnrichmentFields = { resource: { links: [] }, actions: [] };
let sequence = 0;
let activeGroup: number | undefined;

export function captureImageRead(): number { return ++sequence; }
export function hasImageFences(): boolean { return facts.size > 0; }
export function hasImageFence(id: string): boolean { return facts.has(id); }

export function stampImageRead(image: Image, overlay: EnrichmentFields | undefined, issued: number, projection: ReadEvidence["projection"]): void {
  const parsed = Date.parse(image.userMetadata?.lastModified ?? "");
  const stamp = { issued, projection, version: Number.isFinite(parsed) ? parsed : undefined };
  evidence.set(image, stamp);
  if (overlay) evidence.set(overlay, stamp);
  if (overlay?.resource) evidence.set(overlay.resource, stamp);
}

export function isLabelAuthorityCurrent(id: string, resource: NonNullable<EnrichmentFields["resource"]>): boolean {
  const fact = facts.get(id);
  if (!fact) return true;
  const stamp = evidence.get(resource);
  return Boolean(stamp && stamp.issued >= Math.max(fact.operation, fact.authorityRead)
    && (!fact.hasFloor || stamp.issued === fact.acceptedRead
      || (stamp.version !== undefined && fact.floor !== undefined && stamp.version >= fact.floor)));
}

export function copyImageRead(source: object, target: object): void {
  const stamp = evidence.get(source);
  if (stamp) evidence.set(target, stamp);
}

export function ensureImageRead(image: Image, issued: number, projection: ReadEvidence["projection"] = "lean", overlay?: EnrichmentFields): void {
  if (!evidence.has(image)) stampImageRead(image, overlay, issued, projection);
}

export function fullProjectionMatches(full: Image, lean: Image): boolean {
  const fullStamp = evidence.get(full);
  const leanStamp = evidence.get(lean);
  return fullStamp?.projection === "full" && (leanStamp?.version === undefined
    || (fullStamp.version !== undefined && fullStamp.version >= leanStamp.version));
}

export function withholdImageAuthority(id: string): void {
  const fact = facts.get(id);
  if (fact) fact.authorityRead = ++sequence;
}

export function admitLabelObservation(ids: readonly string[]): number | "busy" | "target-limit" | "freshness-capacity" | "conflict" {
  if (ids.length > 200) return "target-limit";
  if (activeGroup !== undefined) return "busy";
  if (ids.some(id => {
    const fact = facts.get(id);
    return fact?.command === "submitted" || fact?.command === "unknown";
  })) return "conflict";
  if (facts.size + ids.filter(id => !facts.has(id)).length > 1_000) return "freshness-capacity";
  const operation = ++sequence;
  for (const id of ids) {
    const previous = facts.get(id);
    facts.set(id, { hasFloor: false, acceptedRead: 0, authorityRead: 0, ...previous,
      operation, command: "submitted" });
  }
  activeGroup = operation;
  return operation;
}

export function recordLabelOutcome(operation: number, id: string, outcome: GridCommandResult["outcome"]): void {
  const fact = facts.get(id);
  if (fact?.operation === operation) fact.command = outcome;
}

export function releaseLabelObservation(operation: number): void {
  if (activeGroup === operation) activeGroup = undefined;
}

export function protectsImageOmission(id: string, issued: number): boolean {
  const fact = facts.get(id);
  return Boolean(fact && issued < Math.max(fact.operation, fact.acceptedRead));
}

export function isImageMetadataCurrent(image: Image, ...overlays: (EnrichmentFields | undefined)[]): boolean {
  const fact = facts.get(image.id);
  if (!fact?.hasFloor) return true;
  const stamp = evidence.get(image);
  const atFloor = stamp?.issued === fact.acceptedRead
    || (stamp?.version !== undefined && fact.floor !== undefined && stamp.version >= fact.floor);
  return atFloor && !overlays.some(overlay => {
    const incoming = overlay && evidence.get(overlay);
    return incoming?.version !== undefined && stamp?.version !== undefined && incoming.version > stamp.version;
  });
}

export function acceptImageRead(image: Image, current?: Image): Image | undefined {
  const fact = facts.get(image.id);
  if (!fact) return image;
  const stamp = evidence.get(image);
  const currentStamp = current && evidence.get(current);
  const retained = !fact.hasFloor || currentStamp?.issued === fact.acceptedRead
    || (currentStamp?.version !== undefined && fact.floor !== undefined && currentStamp.version >= fact.floor)
    ? current : undefined;
  if (!stamp || stamp.issued < fact.operation) return retained;
  if (stamp.issued === fact.acceptedRead) return image;
  if (fact.hasFloor && (stamp.version === undefined || fact.floor === undefined || stamp.version <= fact.floor)) {
    const sameProjection = retained && stamp.issued >= fact.acceptedRead && stamp.version === fact.floor
      && JSON.stringify([image.metadata, image.userMetadata, image.usageRights])
        === JSON.stringify([retained.metadata, retained.userMetadata, retained.usageRights]);
    if (!sameProjection) return retained;
  }
  fact.hasFloor = true;
  fact.floor = stamp.version;
  fact.acceptedRead = stamp.issued;
  return image;
}

export function acceptObservedImages(images: Image[], operation: number): Image[] {
  return images.filter(image => facts.get(image.id)?.operation === operation && acceptImageRead(image) === image);
}

export function acceptImageOverlay(id: string, overlay: EnrichmentFields, current?: EnrichmentFields): EnrichmentFields {
  const fact = facts.get(id);
  if (!fact) return overlay;
  const stamp = evidence.get(overlay);
  if (!stamp || stamp.issued < Math.max(fact.operation, fact.authorityRead)) return current ?? unavailableAuthority;
  fact.authorityRead = stamp.issued;
  if (fact.hasFloor && (stamp.version === undefined || fact.floor === undefined || stamp.version < fact.floor)) {
    const withheld = { ...overlay, resource: { links: [] }, actions: [] };
    evidence.set(withheld, stamp);
    return withheld;
  }
  return overlay;
}

export function resolveImageOverlay(image: Image, ...overlays: (EnrichmentFields | undefined)[]): EnrichmentFields | undefined {
  const fact = facts.get(image.id);
  if (!fact) return overlays.find(overlay => overlay !== undefined);
  if (!isImageMetadataCurrent(image)) return unavailableAuthority;
  let accepted: EnrichmentFields | undefined;
  let latest = Math.max(fact.operation, fact.authorityRead);
  for (const overlay of overlays) {
    const stamp = overlay && evidence.get(overlay);
    if (overlay && stamp && stamp.issued >= latest) {
      latest = stamp.issued;
      accepted = fact.hasFloor && (stamp.version === undefined || fact.floor === undefined || stamp.version < fact.floor)
        ? unavailableAuthority : overlay;
    }
  }
  return accepted ?? unavailableAuthority;
}

export function resetImageFreshnessForTests(): void {
  facts.clear();
  activeGroup = undefined;
}