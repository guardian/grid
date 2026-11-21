import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { GridCommandResult } from "./grid-commands";
import { BATCH_POLICY } from "./batch-execution";

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
  editsHref?: string;
  projection?: string;
  metadataWitness?: string | null;
  availability?: { state: NonNullable<Image["__availability"]>; issued: number };
}

const facts = new Map<string, ImageFact>();
const queuedReservations = new Map<string, number>();
const evidence = new WeakMap<object, ReadEvidence>();
const unavailableAuthority: EnrichmentFields = { resource: { links: [] }, actions: [] };
let sequence = 0;
const activeGroups = new Map<number, readonly string[]>();
let orderingRevision = 0;

export function captureImageRead(): number { return ++sequence; }
export function getImageReadSequence(value: object | undefined): number { return value ? evidence.get(value)?.issued ?? 0 : 0; }
export function hasImageFences(): boolean { return facts.size > 0; }
export function hasImageFence(id: string): boolean { return facts.has(id); }
export function getMetadataWriteWitness(id: string): string | null | undefined { return facts.get(id)?.metadataWitness; }
export function hasNewerImageOperation(id: string, operation: number): boolean { return (facts.get(id)?.operation ?? 0) > operation; }
export function getOrderingRevision(): number { return orderingRevision; }
export function hasOrderingUncertainty(): boolean { return facts.size > 0; }

export function getImageAvailability(id: string): Image["__availability"] { return facts.get(id)?.availability?.state; }

export function retainsEditGrant(id: string, resource: NonNullable<EnrichmentFields["resource"]>): boolean {
  const fact = facts.get(id);
  const href = resource.links.find(link => link.rel === "edits")?.href;
  return Boolean(href && (!fact || !fact.availability && (fact.authorityRead <= getImageReadSequence(resource) || fact.editsHref === href)));
}

export function recordImageAvailability(ids: readonly string[], state: NonNullable<Image["__availability"]>): void {
  const unique = new Set(ids);
  if (facts.size + [...unique].filter(id => !facts.has(id)).length > BATCH_POLICY.maxTouchedImages) throw new Error("Image freshness capacity exceeded");
  const issued = ++sequence;
  for (const id of unique) {
    const fact = facts.get(id) ?? { operation: 0, command: "blocked", hasFloor: false, acceptedRead: 0, authorityRead: 0 };
    fact.availability = { state: fact.availability?.state === "deleted" ? "deleted" : state, issued };
    fact.authorityRead = issued;
    facts.set(id, fact);
  }
  if (unique.size) orderingRevision++;
}

export function unavailableImage(id: string, state: NonNullable<Image["__availability"]>, previous?: Image): Image {
  if (previous?.__availability === state) return previous;
  const image: Image = { id, __availability: state, uploadTime: previous?.uploadTime ?? "", uploadedBy: "",
    metadata: {}, __aiScore: previous?.__aiScore,
    source: { mimeType: previous?.source?.mimeType ?? "", dimensions: previous?.source?.dimensions ?? { width: 1, height: 1 },
      orientedDimensions: previous?.source?.orientedDimensions } };
  if (previous) copyImageRead(previous, image);
  return image;
}

export function stampImageRead(image: Image, overlay: EnrichmentFields | undefined, issued: number, projection: ReadEvidence["projection"]): void {
  const parsed = Date.parse(image.userMetadata?.lastModified ?? "");
  const stamp = { issued, projection, version: Number.isFinite(parsed) ? parsed : undefined };
  evidence.set(image, stamp);
  if (overlay) evidence.set(overlay, stamp);
  if (overlay?.resource) evidence.set(overlay.resource, stamp);
}

export function isLabelAuthorityCurrent(id: string, resource: NonNullable<EnrichmentFields["resource"]>, captured = false): boolean {
  const fact = facts.get(id);
  if (!fact) return true;
  if (fact.availability) return false;
  if (!fact.operation && !fact.authorityRead && !fact.hasFloor) return true;
  if (captured && fact.editsHref && fact.authorityRead >= Math.max(fact.operation, fact.acceptedRead)
    && fact.editsHref === resource.links.find(link => link.rel === "edits")?.href) return true;
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
  if (fact) { fact.authorityRead = ++sequence; fact.editsHref = undefined; }
}

export function watchQueuedLabelTargets(ids: readonly string[]): (() => void) | undefined {
  const unique = [...new Set(ids)];
  const missing = unique.filter(id => !facts.has(id));
  if (facts.size + missing.length > BATCH_POLICY.maxTouchedImages) return undefined;
  for (const id of missing) {
    const fact: ImageFact = { operation: 0, command: "blocked", hasFloor: false, acceptedRead: 0, authorityRead: 0 };
    facts.set(id, fact);
  }
  for (const id of unique) queuedReservations.set(id, (queuedReservations.get(id) ?? 0) + 1);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    for (const id of unique) {
      const count = (queuedReservations.get(id) ?? 1) - 1;
      if (count) queuedReservations.set(id, count);
      else {
        queuedReservations.delete(id);
        const fact = facts.get(id);
        if (fact) fact.metadataWitness = undefined;
        if (fact && !fact.operation && !fact.hasFloor && !fact.authorityRead && !fact.availability) facts.delete(id);
      }
    }
  };
}

export function captureUnsentLabelTargets(ids: readonly string[]) {
  const previous = new Map(ids.map(id => {
    const fact = facts.get(id);
    return [id, fact && { operation: fact.operation, command: fact.command }] as const;
  }));
  return (operation: number, unsent: readonly string[]) => {
    for (const id of unsent) {
      const fact = facts.get(id);
      if (fact?.operation !== operation || fact.command !== "submitted") continue;
      const prior = previous.get(id);
      if (!prior && !fact.hasFloor && !fact.authorityRead && !fact.availability && !queuedReservations.has(id)) facts.delete(id);
      else {
        fact.operation = prior?.operation ?? 0;
        fact.command = prior?.command ?? "blocked";
      }
      previous.delete(id);
    }
    if (!unsent.length) previous.clear();
  };
}

export function hasImageCommandConflict(id: string): boolean {
  const fact = facts.get(id);
  return fact?.command === "submitted" || fact?.command === "unknown";
}

export function admitLabelObservation(ids: readonly string[]): number | "busy" | "target-limit" | "freshness-capacity" | "conflict" {
  if (ids.length > BATCH_POLICY.maxObservationTargets) return "target-limit";
  if (activeGroups.size >= BATCH_POLICY.maxQueued + 1
    || [...activeGroups.values()].reduce((total, targets) => total + targets.length, ids.length) > BATCH_POLICY.maxObservationTargets) return "busy";
  if (ids.some(hasImageCommandConflict)) return "conflict";
  if (facts.size + ids.filter(id => !facts.has(id)).length > BATCH_POLICY.maxTouchedImages) return "freshness-capacity";
  const operation = ++sequence;
  for (const id of ids) {
    const previous = facts.get(id);
    facts.set(id, { hasFloor: false, acceptedRead: 0, authorityRead: 0, ...previous,
      operation, command: "submitted" });
  }
  activeGroups.set(operation, [...ids]);
  if (ids.length > 0) orderingRevision++;
  return operation;
}

export function recordLabelOutcome(operation: number, id: string, outcome: GridCommandResult["outcome"], metadataWitness?: string | null): void {
  const fact = facts.get(id);
  if (fact?.operation === operation) {
    fact.command = outcome;
    if (metadataWitness !== undefined) fact.metadataWitness = queuedReservations.has(id) ? metadataWitness : undefined;
  }
}

export function recordObservedMetadataWitness(operation: number, id: string, witness: string | undefined): void {
  const fact = facts.get(id);
  if (fact?.operation === operation && fact.metadataWitness === null && witness !== undefined && queuedReservations.has(id)) {
    fact.metadataWitness = witness;
  }
}

export function releaseLabelObservation(operation: number): void {
  activeGroups.delete(operation);
}

export function protectsImageOmission(id: string, issued: number): boolean {
  const fact = facts.get(id);
  return Boolean(fact && (fact.availability || issued < Math.max(fact.operation, fact.acceptedRead)));
}

export function isImageMetadataCurrent(image: Image, ...overlays: (EnrichmentFields | undefined)[]): boolean {
  const fact = facts.get(image.id);
  if (image.__availability || fact?.availability) return false;
  if (!fact?.hasFloor) return true;
  const stamp = evidence.get(image);
  const atFloor = stamp?.issued === fact.acceptedRead
    || (stamp?.version !== undefined && fact.floor !== undefined && stamp.version >= fact.floor);
  return atFloor && !overlays.some(overlay => {
    const incoming = overlay && evidence.get(overlay);
    return incoming?.version !== undefined && stamp?.version !== undefined && incoming.version > stamp.version;
  });
}

export function needsImageRead(image: Image): boolean {
  const fact = facts.get(image.id);
  if (!fact || fact.availability || activeGroups.has(fact.operation)
    || (!fact.operation && !fact.authorityRead && !fact.hasFloor)) return false;
  const stamp = evidence.get(image);
  return !isImageMetadataCurrent(image) || !stamp || stamp.issued < Math.max(fact.operation, fact.authorityRead);
}

export function acceptImageRead(image: Image, current?: Image): Image | undefined {
  const fact = facts.get(image.id);
  if (!fact) return image;
  const stamp = evidence.get(image);
  if (fact.availability && (fact.availability.state === "deleted" || !stamp || stamp.issued <= fact.availability.issued)) {
    return unavailableImage(image.id, fact.availability.state, current ?? image);
  }
  const currentStamp = current && evidence.get(current);
  const retained = fact.availability ? unavailableImage(image.id, fact.availability.state, current ?? image)
    : !fact.hasFloor || currentStamp?.issued === fact.acceptedRead
    || (currentStamp?.version !== undefined && fact.floor !== undefined && currentStamp.version >= fact.floor)
    ? current : undefined;
  if (!stamp || stamp.issued < fact.operation) return retained;
  if (stamp.issued === fact.acceptedRead) return image;
  const projection = JSON.stringify([image.metadata, image.userMetadata, image.usageRights]);
  if (fact.hasFloor && (stamp.version === undefined || (fact.floor !== undefined && stamp.version <= fact.floor))) {
    const sameProjection = stamp.issued >= fact.acceptedRead && stamp.version === fact.floor && projection === fact.projection;
    if (!sameProjection) return retained;
  }
  if (!fact.hasFloor || stamp.version !== fact.floor) orderingRevision++;
  fact.hasFloor = true;
  fact.floor = stamp.version;
  fact.acceptedRead = stamp.issued;
  fact.projection = projection;
  fact.availability = undefined;
  return image;
}

export function acceptObservedImages(images: Image[], operation: number): Image[] {
  return images.filter(image => (facts.get(image.id)?.operation === operation || activeGroups.get(operation)?.includes(image.id))
    && acceptImageRead(image) === image);
}

export function acceptImageOverlay(id: string, overlay: EnrichmentFields, current?: EnrichmentFields): EnrichmentFields {
  const fact = facts.get(id);
  if (!fact) return overlay;
  if (fact.availability) return unavailableAuthority;
  const stamp = evidence.get(overlay);
  if (!stamp || stamp.issued < Math.max(fact.operation, fact.authorityRead)) return current ?? unavailableAuthority;
  fact.authorityRead = stamp.issued;
  fact.editsHref = undefined;
  if (fact.hasFloor && stamp.issued !== fact.acceptedRead && (stamp.version === undefined || fact.floor === undefined || stamp.version < fact.floor)) {
    const withheld = { ...overlay, resource: { links: [] }, actions: [] };
    evidence.set(withheld, stamp);
    return withheld;
  }
  fact.editsHref = overlay.resource?.links.find(link => link.rel === "edits")?.href;
  return overlay;
}

export function resolveImageOverlay(image: Image, ...overlays: (EnrichmentFields | undefined)[]): EnrichmentFields | undefined {
  const fact = facts.get(image.id);
  if (image.__availability || fact?.availability) return unavailableAuthority;
  if (!fact) return overlays.find(overlay => overlay !== undefined);
  if (!isImageMetadataCurrent(image)) return unavailableAuthority;
  let accepted: EnrichmentFields | undefined;
  let latest = Math.max(fact.operation, fact.authorityRead);
  for (const overlay of overlays) {
    const stamp = overlay && evidence.get(overlay);
    if (overlay && stamp && stamp.issued >= latest) {
      latest = stamp.issued;
      accepted = fact.hasFloor && stamp.issued !== fact.acceptedRead && (stamp.version === undefined || fact.floor === undefined || stamp.version < fact.floor)
        ? unavailableAuthority : overlay;
    }
  }
  return accepted ?? unavailableAuthority;
}

export function resetImageFreshnessForTests(): void {
  facts.clear();
  queuedReservations.clear();
  activeGroups.clear();
  orderingRevision = 0;
}