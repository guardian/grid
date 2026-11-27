import { SUBJECTS } from "./metadata-pill-fields";
import { z } from "zod";
import { findLink, parseArgoErrorBody } from "@/dal/grid-api/argo";
import { gridServiceOrigin, gridServiceUrl, LOCAL_MEDIA_API_BASE_URL, LOCAL_MEDIA_API_ORIGIN, mediaApiUrl } from "@/dal/grid-api/proxy-target";
import { apiGetImage, SearchAfterApiError } from "@/dal/grid-api-search-adapter";
import { getGridServiceOrigin, getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated, serviceLink } from "./grid-api-instance";
import { addressableLabel, isCollectionMembershipRequest, isLabelRemovalRequest } from "./grid-mutation-policy";
import { leaseCommandValueSchema, leaseSetKey, storedLeases } from "./lease-change";
import { editingAllowedAtStartup } from "./editing-preference";
import { BATCH_POLICY } from "./batch-execution";
import { copyImageRead, getMetadataWriteWitness, retainsEditGrant } from "./image-read-freshness";
import { useCollectionStore } from "@/stores/collection-store";
import { isValidCropRect, originalCropSize } from "./crop/crop-request";
import { allowsCropRatio, getCropSettings } from "./crop/crop-options";
import { imageHasFullFrame } from "./crop/crop-policy";
import { isHostedBuild } from "./hosted-config";
import { CROP_SAVE_TIMEOUT_MS } from "@/constants/tuning";
import type { Image } from "@/types/image";
import type { EnrichmentFields } from "@/stores/enrichment-store";

const addLabelsSchema = z.object({
  operation: z.literal("add-labels"),
  imageId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  resource: z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) }),
  labels: z.array(z.string().refine(addressableLabel)).min(1),
}).strict();
const removeLabelSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({
  operation: z.literal("remove-label"), label: z.string().refine(value => value.trim().length > 0),
}).strict();
const metadataCommandSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({
  operation: z.literal("edit-metadata"),
  fieldId: z.enum(["metadata_title", "metadata_description", "metadata_specialInstructions", "metadata_byline",
    "metadata_credit", "metadata_copyright", "metadata_dateTaken", "metadata_imageType", "metadata_keywords",
    "metadata_peopleInImage", "metadata_subjects", "location"]),
  action: z.enum(["overwrite", "prepend", "append", "add", "remove", "if-empty"]),
  removed: z.array(z.string()).optional(),
  value: z.union([z.string(), z.array(z.string().min(1)), z.object({ subLocation: z.string().optional(), city: z.string().optional(),
    state: z.string().optional(), country: z.string().optional() }).strict()]),
}).strict();
const nonempty = z.string().refine(text => text.trim().length > 0);
const restriction = { restrictions: nonempty.optional() };
export const rightsValueSchema = z.union([
  z.object({ category: z.literal("") }).strict(),
  z.object({ category: z.literal("agency"), supplier: nonempty, suppliersCollection: z.string().optional(), ...restriction }).strict(),
  z.object({ category: z.literal("pay-to-use"), ...restriction }).strict(),
  z.object({ category: z.literal("pr-and-third-party"), source: nonempty, restrictions: nonempty }).strict(),
  z.object({ category: z.enum(["publisher-photography", "publisher-illustration"]), creator: nonempty, publication: nonempty, ...restriction }).strict(),
]);
const rightsCommandSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({ operation: z.literal("edit-rights"), value: rightsValueSchema }).strict();
export type RightsCommand = z.infer<typeof rightsCommandSchema>;
export type ObserveRights = (command: RightsCommand, metadataBefore: string, onMatch?: (metadata: import("@/types/image").Image["metadata"]) => void) => Promise<boolean>;
export type DerivedDispatch = (imageId: string, fields: readonly string[]) => void;
const leaseCommandSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({ operation: z.literal("edit-leases"), value: leaseCommandValueSchema }).strict();
export type LeaseCommand = z.infer<typeof leaseCommandSchema>;
const labelListSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({ operation: z.literal("edit-label-list"),
  add: z.array(z.string().refine(addressableLabel)), remove: z.array(nonempty), clear: z.boolean() }).strict();
export type LabelListCommand = z.infer<typeof labelListSchema>;
const photoshootSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({ operation: z.literal("edit-photoshoot"), value: z.string().trim(), projectionMatches: z.boolean() }).strict();
export type PhotoshootCommand = z.infer<typeof photoshootSchema>;
const photoshootResource = z.object({ data: z.object({ photoshoot: z.object({ uri: z.string(), data: z.object({ title: z.string() }).optional() }) }) });
const collectionSchema = z.object({ operation: z.literal("edit-collection"), imageId: addLabelsSchema.shape.imageId,
  action: z.enum(["add", "remove"]), path: z.array(z.string().min(1).refine(bit => bit !== "." && bit !== ".." && !/[\/\\"\u0000-\u001f]/.test(bit))).min(1) }).strict();
const collectionData = z.object({ pathId: z.string(), path: z.array(z.string()) });
const membershipSchema = collectionSchema.omit({ path: true, action: true, operation: true }).extend({
  operation: z.literal("edit-memberships"), action: z.enum(["add", "remove", "overwrite"]), pathIds: z.array(z.string().min(1)),
  fillMissing: z.literal(true).optional(),
}).strict();
export type MembershipCommand = z.infer<typeof membershipSchema>;
const collectionAction = z.object({ name: z.string(), method: z.string(), href: z.string() });
const archiveSchema = z.object({ operation: z.literal("set-archive"), imageId: addLabelsSchema.shape.imageId, value: z.boolean() }).strict();
export type ArchiveCommand = z.infer<typeof archiveSchema>;
const archiveImage = z.object({ data: z.object({ id: z.string(), softDeletedMetadata: z.null().optional(), userMetadata: z.object({ data: z.object({ archived: z.object({ uri: z.string(), data: z.boolean() }) }) }) }) });
const cropBounds = z.object({ x: z.int().nonnegative(), y: z.int().nonnegative(), width: z.int().positive(), height: z.int().positive() });
const cropCommandSchema = z.object({ operation: z.literal("create-crop"), imageId: addLabelsSchema.shape.imageId,
  request: z.discriminatedUnion("type", [
    z.object({ type: z.literal("full"), source: z.string() }).strict(),
    cropBounds.extend({ type: z.literal("crop"), source: z.string(), aspectRatio: z.string().regex(/^\d+:\d+$/).optional() }).strict(),
  ]),
}).strict();
const cropReceiptSchema = z.object({ id: z.string(), date: z.iso.datetime({ offset: true }) });
const commandSchema = z.discriminatedUnion("operation", [addLabelsSchema, removeLabelSchema, metadataCommandSchema, rightsCommandSchema, leaseCommandSchema, labelListSchema, photoshootSchema, collectionSchema, membershipSchema, archiveSchema, cropCommandSchema]);
const rightsResourceSchema = z.object({ data: z.object({ usageRights: z.object({ uri: z.string() }),
  metadata: z.object({ data: z.record(z.string(), z.unknown()), actions: z.array(z.object({ name: z.string(), method: z.string(), href: z.string() })) }) }) });
const metadataResourceSchema = z.object({ data: z.object({ metadata: z.object({
  uri: z.string(), data: z.record(z.string(), z.unknown()),
}) }) });
const originalResourceSchema = z.object({ data: z.object({ id: z.string(), originalMetadata: z.record(z.string(), z.unknown()) }),
  links: z.array(z.object({ rel: z.string(), href: z.string() })),
});
const labelsResourceSchema = z.object({ data: z.object({ labels: z.object({ uri: z.string() }) }) });
const removalResourceSchema = z.object({ data: z.object({ labels: z.object({
  uri: z.string(), data: z.array(z.object({ uri: z.string(), data: z.string() })),
}) }) });

export type AddLabelsCommand = z.infer<typeof addLabelsSchema>;
export type RemoveLabelCommand = z.infer<typeof removeLabelSchema>;
export type LabelCommand = AddLabelsCommand | RemoveLabelCommand;
export type MetadataCommand = z.infer<typeof metadataCommandSchema>;
export type MetadataExpected = Readonly<Record<string, string | string[]>>;

type LabelSteps = Readonly<{ acknowledged: number; rejected: number; notSent: number; uncertain: number }>;
export type GridCommandResult =
  | { outcome: "blocked"; reason: "disabled" | "invalid-command" | "unavailable" | "reload-required" | "unaddressable-label"; labelSteps?: LabelSteps; status?: 429 }
  | { outcome: "acknowledged"; expectedLeases?: string; expected?: MetadataExpected; metadataWitness?: string; metadataFromRights?: "acknowledged" | "rejected" | "unknown" | "not-sent"; status?: number; crop?: z.infer<typeof cropReceiptSchema> }
  | { outcome: "unchanged"; expectedLeases?: string; expected?: MetadataExpected; metadataWitness?: string }
  | { outcome: "partial"; expected: MetadataExpected; labelSteps: LabelSteps; status?: number; errorKey?: string; reason?: "reload-required" | "unavailable" }
  | { outcome: "rejected"; status: number; errorKey: string; labelSteps?: LabelSteps }
  | { outcome: "unknown"; status?: 429; expected?: MetadataExpected; expectedLeases?: string; labelSteps?: LabelSteps };

export function metadataWriteFingerprint(value: unknown): string | undefined {
  try {
    const metadata = z.record(z.string(), z.unknown()).parse(value);
    const normalize = (part: unknown, field?: string): unknown => {
      if (part === null || part === undefined) throw new Error("Ambiguous metadata value");
      if (field === "dateTaken") {
        if (typeof part !== "string" || !Number.isFinite(Date.parse(part))) throw new Error("Invalid metadata date");
        return new Date(part).toISOString();
      }
      if (Array.isArray(part)) {
        const items = part.map(item => normalize(item));
        return field === "keywords" || field === "peopleInImage" ? [...new Set(z.array(z.string()).parse(items))].sort() : items;
      }
      if (typeof part === "object") return Object.fromEntries(Object.entries(part).sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]));
      return part;
    };
    return JSON.stringify(Object.keys(metadata).sort().map(field => [field, normalize(metadata[field], field)]));
  } catch { return undefined; }
}

function metadataChange(command: MetadataCommand, original: Record<string, unknown>, overrides: Record<string, unknown>) {
  const expected: Record<string, string | string[]> = {};
  if (command.fieldId === "location") {
    if (command.action !== "overwrite" || typeof command.value === "string" || Array.isArray(command.value) || !Object.keys(command.value).length) return;
    Object.assign(expected, command.value);
  } else {
    const field = command.fieldId.slice("metadata_".length);
    const current = overrides[field] ?? original[field];
    if (field === "keywords" || field === "peopleInImage" || field === "subjects") {
      if (!["overwrite", "add", "remove"].includes(command.action) || current !== undefined && !Array.isArray(current)) return;
      if (typeof command.value !== "string" && !Array.isArray(command.value)) return;
      const values = Array.isArray(command.value) ? command.value : command.action === "overwrite" ? [...new Set(command.value.split(",").map(value => value.trim()).filter(Boolean))]
        : command.value.trim() ? [command.value.trim()] : [];
      const existing = z.array(z.string()).safeParse(current ?? []);
      if (!existing.success) return;
      if (field === "subjects" && command.action !== "remove" && (values.some(subject => !SUBJECTS.includes(subject)) || command.action === "overwrite" && (typeof command.value === "string" || values.length > 0))) return;
      const removed = new Set(command.removed);
      expected[field] = field === "subjects" && command.action === "add" ? [...existing.data.filter(value => !removed.has(value)), ...new Set(values.filter(value => !existing.data.includes(value)))]
        : command.action === "add" ? [...new Set([...existing.data.filter(value => !removed.has(value)), ...values])]
        : command.action === "remove" ? existing.data.filter(value => !values.includes(value)) : values;
    } else {
      if (typeof command.value !== "string") return;
      if (current !== undefined && typeof current !== "string") return;
      if (command.action !== "overwrite" && (field !== "description" || !["prepend", "append", "if-empty"].includes(command.action))) return;
      if (field === "dateTaken" && (!command.value || !Number.isFinite(Date.parse(command.value)))) return;
      expected[field] = command.action === "prepend" ? `${command.value} ${current ?? ""}`
        : command.action === "append" ? `${current ?? ""} ${command.value}`
        : command.action === "if-empty" && current ? current : command.value;
    }
  }
  const replacement = { ...overrides };
  for (const [field, value] of Object.entries(expected)) {
    if (JSON.stringify(value) === JSON.stringify(original[field])) delete replacement[field];
    else replacement[field] = value;
  }
  return { expected, replacement, unchanged: JSON.stringify(replacement) === JSON.stringify(overrides) };
}

async function failure(response: Response, dispatched: boolean): Promise<Extract<GridCommandResult, { outcome: "unknown" | "rejected" }>> {
  if (response.status === 401 || response.status === 419) invalidateGridSession();
  if (dispatched && ![401, 403, 419, 422].includes(response.status)) return {
    outcome: "unknown", ...(response.status === 429 && { status: 429 as const }),
  };
  const body: unknown = await response.json().catch(() => null);
  return { outcome: "rejected", status: response.status, errorKey: parseArgoErrorBody(body).errorKey };
}

export function gridLabelEditingEnabled(): boolean {
  return import.meta.env.VITE_USE_MEDIA_API === "true" && editingAllowedAtStartup;
}

export type CropReceipt = z.infer<typeof cropReceiptSchema>;

export function showsSavedCrop(image: Image, enrichment: EnrichmentFields | undefined, receipt: CropReceipt): boolean {
  return !image.softDeletedMetadata && Boolean(enrichment?.resource?.links.some(link => link.rel === "crops"))
    && Boolean(image.exports?.some(crop => crop.id === receipt.id && crop.date === receipt.date
      && [...crop.assets ?? [], crop.master].some(asset => (asset?.secureUrl || asset?.file)
        && asset.dimensions?.width > 0 && asset.dimensions?.height > 0)));
}

export async function observeSavedCrop(imageId: string, receipt: CropReceipt,
  waits: readonly number[] = [0, 250, 500, 1000, 2000, 4000, 8000, 16_000, 30_000]) {
  if (!gridLabelEditingEnabled()) return;
  const budgetMs = 65_000;
  const started = performance.now();
  const budget = AbortSignal.timeout(budgetMs);
  let elapsed = 0;
  for (const wait of waits) {
    elapsed += wait;
    if (elapsed >= budgetMs || budget.aborted || isGridSessionInvalidated()) return;
    const delay = started + elapsed - performance.now();
    if (delay > 0) await new Promise<void>(resolve => setTimeout(resolve, delay));
    if (budget.aborted || isGridSessionInvalidated()) return;
    try {
      const result = await apiGetImage(imageId, AbortSignal.any([budget, AbortSignal.timeout(5000)]));
      if (result && showsSavedCrop(result.image, result.enrichment, receipt)) return result;
    } catch (error) {
      if (error instanceof SearchAfterApiError && (error.status === 401 || error.status === 419)) {
        invalidateGridSession();
        return;
      }
    }
  }
}

type CropDispatch = { onPost?: () => void };

async function createCrop({ imageId, request }: z.infer<typeof cropCommandSchema>, dispatch?: CropDispatch): Promise<GridCommandResult> {
  const blocked = { outcome: "blocked", reason: "unavailable" } as const;
  let dispatched = false;
  try {
    const base = mediaApiUrl("");
    const canonicalSource = `${base === LOCAL_MEDIA_API_BASE_URL ? LOCAL_MEDIA_API_ORIGIN : base}/images/${imageId}`;
    if (request.source !== canonicalSource) return blocked;
    const signal = AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs);
    const options = { credentials: "include", redirect: "error", signal } as const;
    const root = await serviceLink("cropper");
    const origin = gridServiceOrigin(root);
    const rootUrl = gridServiceUrl("cropper", origin && `${origin}/`, "/", origin);
    if (!rootUrl || !isHostedBuild() && (base !== LOCAL_MEDIA_API_BASE_URL || rootUrl !== "/grid-local-cropper/")
      || isGridSessionInvalidated() || signal.aborted) return blocked;
    const discovery = await fetch(rootUrl, options);
    if (!discovery.ok) {
      if (discovery.status === 429) return { ...blocked, status: 429 };
      if (discovery.status !== 401 && discovery.status !== 419) return blocked;
      invalidateGridSession();
      return { outcome: "blocked", reason: "reload-required" };
    }
    const destination = findLink(await discovery.json(), "crop")?.href;
    const url = gridServiceUrl("cropper", destination, "/crops", origin);
    if (!url || isGridSessionInvalidated()) return blocked;
    const fresh = await apiGetImage(imageId, options.signal);
    const resource = fresh?.enrichment?.resource;
    if (!fresh || fresh.image.softDeletedMetadata || fresh.enrichment?.valid !== true || resource?.uri !== canonicalSource
      || !resource.links.some(link => link.rel === "crops" && link.href === `${origin}/crops/${imageId}`)) return blocked;
    const size = originalCropSize(fresh.image);
    if (!size || !Number.isSafeInteger(size.width) || !Number.isSafeInteger(size.height) || isGridSessionInvalidated()) return blocked;
    const bounds = request.type === "crop" ? request : { x: 0, y: 0, ...size };
    const settings = getCropSettings();
    if (!isValidCropRect(bounds, size) || (request.type === "full" ? settings.lockedType !== undefined
      : !allowsCropRatio(settings, request.aspectRatio))) return blocked;
    if (request.type === "full") {
      if (!Array.isArray(fresh.image.exports)) return blocked;
      if (imageHasFullFrame(fresh.image)) return { outcome: "unchanged" };
    }
    if (signal.aborted) return blocked;
    dispatched = true;
    // Cropper replies only after generating every rendition; large sources can take minutes.
    const response = fetch(url, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(CROP_SAVE_TIMEOUT_MS), method: "POST",
      headers: { "Content-Type": "application/json" }, body: JSON.stringify(request) });
    dispatch?.onPost?.();
    const result = await response;
    if (result.status === 400) {
      const errorKey = parseArgoErrorBody(await result.json()).errorKey;
      return ["invalid-source", "image-not-found", "invalid-image", "no-source-image", "invalid-crop", "bad-request"].includes(errorKey)
        ? { outcome: "rejected", status: result.status, errorKey } : { outcome: "unknown" };
    }
    if (!result.ok) return failure(result, true);
    const receipt = cropReceiptSchema.safeParse(await result.json());
    const expectedId = `${bounds.x}_${bounds.y}_${bounds.width}_${bounds.height}`;
    return receipt.success && receipt.data.id === expectedId
      ? { outcome: "acknowledged", crop: receipt.data } : { outcome: "unknown" };
  } catch (error) {
    if (!dispatched && error instanceof SearchAfterApiError && (error.status === 401 || error.status === 419)) {
      invalidateGridSession();
      return { outcome: "blocked", reason: "reload-required" };
    }
    if (!dispatched && error instanceof SearchAfterApiError && error.status === 429) return { ...blocked, status: 429 };
    return dispatched ? { outcome: "unknown" } : blocked;
  }
}

async function executeLeaseChange(command: LeaseCommand): Promise<GridCommandResult> {
  let dispatchedLeases: string | undefined;
  const blocked = { outcome: "blocked", reason: "unavailable" } as const;
  try {
    const { imageId, value } = command;
    const [origin, session] = await Promise.all([getGridServiceOrigin("leases"), getGridSessionPermissions()]);
    if (!origin || !session || isGridSessionInvalidated()) return blocked;
    const signal = AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs);
    const options = { credentials: "include", redirect: "error", signal } as const;
    const full = await fetch(mediaApiUrl(`/images/${imageId}`), options);
    if (!full.ok) return failure(full, false);
    const image = await full.json();
    const path = `/leases/media/${imageId}`;
    if (image.data?.id !== imageId || !findLink(command.resource, "edits")?.href || findLink(image, "edits")?.href !== findLink(command.resource, "edits")?.href) return blocked;
    const name = value.kind === "add" ? "add-lease" : value.kind === "remove" || !value.leases.length ? "delete-leases" : "replace-leases";
    const method = name === "add-lease" ? "POST" : name === "replace-leases" ? "PUT" : "DELETE";
    const action = (image.actions as {name: string; method: string; href: string}[] | undefined)?.find(item => item.name === name && item.method === method);
    let target = gridServiceUrl("leases", action?.href, name === "add-lease" ? "/leases" : path, origin);
    const source = gridServiceUrl("leases", findLink(image, "leases")?.href, path, origin);
    if (!source || !target) return blocked;
    const response = await fetch(source, options);
    if (!response.ok) return failure(response, false);
    const current = storedLeases.safeParse(await response.json());
    if (!current.success || current.data.data.leases.some(item => item.mediaId !== imageId)) return blocked;
    const before = current.data.data.leases;
    let body: unknown;
    let expectedLeases: string;
    const forImage = (lease: Parameters<typeof leaseSetKey>[0][number]) => ({ ...lease, mediaId: imageId, createdAt: new Date().toISOString() });
    if (value.kind === "remove") {
      if (!before.some(item => item.id === value.id)) return blocked;
      const root = await fetch(gridServiceUrl("leases", `${origin}/`, "/", origin)!, options);
      if (!root.ok) return failure(root, false);
      const template = findLink(await root.json(), "leases")?.href;
      if (template !== `${origin}/leases/{id}`) return blocked;
      target = gridServiceUrl("leases", template.replace("{id}", value.id), `/leases/${value.id}`, origin);
      expectedLeases = leaseSetKey(before.filter(item => item.id !== value.id));
    } else if (value.kind === "add") {
      const syndication = value.lease.access.endsWith("-syndication");
      if (syndication) {
        const existing = before.filter(item => item.access.endsWith("-syndication"));
        if (existing.length > 1 || existing[0]?.id !== value.approvedLeaseId) return blocked;
      }
      expectedLeases = leaseSetKey([...before.filter(item => !syndication || !item.access.endsWith("-syndication")), value.lease]);
      body = forImage(value.lease);
    } else {
      expectedLeases = leaseSetKey(value.leases);
      if (expectedLeases === leaseSetKey(before)) return { outcome: "unchanged", expectedLeases };
      if (value.leases.length) body = value.leases.map(forImage);
    }
    if (!target || isGridSessionInvalidated() || !retainsEditGrant(imageId, command.resource)) return blocked;
    const request = { ...options, method, ...(body !== undefined && { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) };
    dispatchedLeases = expectedLeases;
    const write = await fetch(target, request);
    if (write.ok) return { outcome: "acknowledged", expectedLeases };
    const failed = await failure(write, true);
    return failed.outcome === "unknown" ? { ...failed, expectedLeases } : failed;
  } catch { return dispatchedLeases !== undefined ? { outcome: "unknown", expectedLeases: dispatchedLeases } : blocked; }
}

async function executeCollectionChange(command: z.infer<typeof collectionSchema> | MembershipCommand): Promise<GridCommandResult> {
  const blocked = { outcome: "blocked", reason: "unavailable" } as const;
  let dispatched = false;
  try {
    const [origin, session] = await Promise.all([getGridServiceOrigin("collections"), getGridSessionPermissions()]);
    if (!origin || !session || isGridSessionInvalidated()) return blocked;
    const keys = command.operation === "edit-collection" ? [command.path.join("/").toLowerCase()] : [...new Set(command.pathIds)];
    if ((command.action === "overwrite") !== !keys.length) return blocked;
    const path = `/images/${command.imageId}`;
    const options = { credentials: "include", redirect: "error", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs) } as const;
    const read = await fetch(mediaApiUrl(path), options);
    if (!read.ok) return failure(read, false);
    const image = z.object({ data: z.object({ id: z.string(), collections: z.array(z.object({ data: collectionData, actions: z.array(collectionAction).optional() })) }), actions: z.array(collectionAction).optional() }).parse(await read.json());
    if (image.data.id !== command.imageId) return blocked;
    const add = command.action === "add";
    const sourceUrl = gridServiceUrl("collections", origin + path, path, origin);
    if (!sourceUrl) return blocked;
    const source = await fetch(sourceUrl, options);
    if (!source.ok && source.status !== 404) return failure(source, false);
    const sourceBody = await source.json();
    const missing = parseArgoErrorBody(sourceBody);
    if (!source.ok && (image.data.collections.length || missing.errorKey !== "not-found" || missing.errorMessage !== "No collections found")) return blocked;
    const sourceMembers = source.ok ? z.object({ data: z.array(collectionData) }).parse(sourceBody).data : [];
    const members = new Map(image.data.collections.map(member => [member.data.pathId, member]));
    const current = new Set(sourceMembers.map(member => member.pathId));
    if (members.size !== image.data.collections.length || current.size !== sourceMembers.length || members.size !== current.size || sourceMembers.some(item =>
      item.pathId !== item.path.join("/").toLowerCase() || JSON.stringify(members.get(item.pathId)?.data.path) !== JSON.stringify(item.path))) return blocked;
    const steps: { key: string; url: string; body?: string }[] = [];
    const method = add ? "POST" : "DELETE";
    for (const key of command.action === "overwrite" ? current : keys) {
      const member = members.get(key);
      if (!add && !member || add && member && command.operation === "edit-memberships" && command.fillMissing) continue;
      let endpoint = path, actions = image.actions, body: string | undefined;
      if (add) {
        const { tree, status, countServiceUri } = useCollectionStore.getState();
        if (!tree || status !== "ready" || countServiceUri !== origin) return blocked;
        let node: typeof tree | undefined = tree;
        for (const bit of key.split("/")) node = node?.data.children.find(child => child.data.fullPath.at(-1)?.toLowerCase() === bit);
        const entry = node?.data.data;
        if (!entry || entry.pathId !== key || command.operation === "edit-collection" && JSON.stringify(entry.path) !== JSON.stringify(command.path)) return blocked;
        body = JSON.stringify({ data: entry.path });
      } else if (member) {
        endpoint += "/" + member.data.path.map(bit => encodeURIComponent(bit).replace(/[!'()~]/g, char => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)).join("/");
        actions = member.actions;
      }
      const action = actions?.find(item => item.name === (add ? "add-collection" : "remove") && item.method === method);
      const url = gridServiceUrl("collections", action?.href, endpoint, origin);
      if (!url || !isCollectionMembershipRequest(method, endpoint)) return blocked;
      steps.push({ key, url, body });
    }
    const filingDates: Record<string, string> = {};
    const expected = () => ({ collections: [...current], ...filingDates });
    for (const [index, step] of steps.entries()) {
      const labelSteps = { acknowledged: index, rejected: 0, uncertain: 0, notSent: steps.length - index };
      if (options.signal.aborted || isGridSessionInvalidated()) return index ? { outcome: "partial", expected: { collections: [...current] }, labelSteps, reason: isGridSessionInvalidated() ? "reload-required" : "unavailable" } : blocked;
      dispatched = true;
      let failed: Awaited<ReturnType<typeof failure>> | undefined;
      try {
        const response = await fetch(step.url, { ...options, method, ...(step.body && { headers: { "Content-Type": "application/json" }, body: step.body }) });
        if (!response.ok) failed = await failure(response, true);
        if (response.ok && add && members.has(step.key)) {
          const body = await response.json().catch(() => undefined);
          const date = body?.data?.pathId === step.key && body?.data?.actionData?.date;
          filingDates[`filed:${step.key}`] = typeof date === "string" ? date : "";
        }
      } catch { failed = { outcome: "unknown" }; }
      if (failed?.outcome === "rejected") return index ? { ...failed, outcome: "partial", expected: { collections: [...current] }, labelSteps: { ...labelSteps, rejected: 1, notSent: labelSteps.notSent - 1 } } : failed;
      if (add) current.add(step.key); else current.delete(step.key);
      if (failed) {
        if (add && members.has(step.key)) filingDates[`filed:${step.key}`] = "";
        return { ...failed, expected: expected(), labelSteps: { ...labelSteps, uncertain: 1, notSent: labelSteps.notSent - 1 } };
      }
    }
    return { outcome: steps.length ? "acknowledged" : "unchanged", expected: expected() };
  } catch { return dispatched ? { outcome: "unknown" } : blocked; }
}

export async function executeGridCommand(input: unknown, observeRights?: ObserveRights, onDerivedDispatch?: DerivedDispatch, cropDispatch?: CropDispatch): Promise<GridCommandResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { outcome: "blocked", reason: "invalid-command" };
  const command = parsed.data;
  if ("resource" in command) copyImageRead((input as { resource: object }).resource, command.resource);
  if (!gridLabelEditingEnabled()) return { outcome: "blocked", reason: "disabled" };
  if (command.operation === "edit-rights" && !observeRights) return { outcome: "blocked", reason: "unavailable" };
  if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
  if (command.operation === "create-crop") return createCrop(command, cropDispatch);
  if (command.operation === "set-archive") {
    const blocked = { outcome: "blocked", reason: "unavailable" } as const;
    let dispatched = false;
    try {
      const [origin, grant, session] = await Promise.all([getGridServiceOrigin("metadata"), serviceLink("archive"), getGridSessionPermissions()]);
      if (!origin || grant !== `${origin}/metadata/{id}/archived` || !session || isGridSessionInvalidated()) return blocked;
      const options = { credentials: "include", redirect: "error", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs) } as const;
      const response = await fetch(mediaApiUrl(`/images/${command.imageId}`), options);
      if (!response.ok) return failure(response, false);
      const result = archiveImage.safeParse(await response.json());
      if (!result.success || result.data.data.id !== command.imageId || isGridSessionInvalidated()) return blocked;
      const flag = result.data.data.userMetadata.data.archived;
      const url = gridServiceUrl("metadata", flag.uri, `/metadata/${command.imageId}/archived`, origin);
      if (!url) return blocked;
      dispatched = true;
      const write = await fetch(url, { ...options, method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: command.value }) });
      return write.ok ? { outcome: "acknowledged" } : await failure(write, true);
    } catch { return dispatched ? { outcome: "unknown" } : blocked; }
  }
  if (command.operation === "edit-leases") return executeLeaseChange(command);
  if (command.operation === "edit-collection" || command.operation === "edit-memberships") return executeCollectionChange(command);
  const path = `/metadata/${command.imageId}`;
  const href = findLink(command.resource, "edits")?.href;
  const witness = command.operation === "edit-metadata" || command.operation === "edit-rights" ? getMetadataWriteWitness(command.imageId) : undefined;
  if (witness === null) return { outcome: "blocked", reason: "unavailable" };

  let dispatched = false;
  let expected: MetadataExpected | undefined;
  try {
    const origin = await getGridServiceOrigin("metadata");
    if (!origin) return { outcome: "blocked", reason: "unavailable" };
    const editsUrl = gridServiceUrl("metadata", href, path, origin);
    if (!editsUrl) return { outcome: "blocked", reason: "invalid-command" };
    const session = await getGridSessionPermissions();
    if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
    if (!session) return { outcome: "blocked", reason: "unavailable" };
    let original: Record<string, unknown> | undefined;
    if (command.operation === "edit-metadata") {
      const full = await fetch(mediaApiUrl(`/images/${command.imageId}`), {
        credentials: "include", redirect: "error", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs),
      });
      if (!full.ok) return failure(full, false);
      const image = originalResourceSchema.safeParse(await full.json());
      if (!image.success || image.data.data.id !== command.imageId
        || gridServiceUrl("metadata", findLink(image.data, "edits")?.href, path, origin) !== editsUrl) {
        return { outcome: "blocked", reason: "unavailable" };
      }
      original = image.data.data.originalMetadata;
      if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
    }
    const sourceSignal = AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs);
    let body: unknown;
    for (let attempt = 0; attempt < BATCH_POLICY.sourceReadAttempts; attempt++) {
      if (attempt) await new Promise(resolve => setTimeout(resolve, BATCH_POLICY.sourceReadIntervalMs));
      sourceSignal.throwIfAborted();
      if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
      const response = await fetch(editsUrl, { credentials: "include", redirect: "error", signal: sourceSignal });
      if (!response.ok) return failure(response, false);
      body = await response.json();
      if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
      if (witness === undefined) break;
      const source = metadataResourceSchema.safeParse(body);
      if (source.success && metadataWriteFingerprint(source.data.data.metadata.data) === witness) break;
      if (attempt + 1 === BATCH_POLICY.sourceReadAttempts) return { outcome: "blocked", reason: "unavailable" };
    }
    if (!retainsEditGrant(command.imageId, command.resource)) return { outcome: "blocked", reason: "unavailable" };
    if (command.operation === "edit-photoshoot") {
      const resource = photoshootResource.safeParse(body);
      if (!resource.success) return { outcome: "blocked", reason: "unavailable" };
      const shoot = resource.data.data.photoshoot;
      const target = gridServiceUrl("metadata", shoot.uri, `${path}/photoshoot`, origin);
      if (!target) return { outcome: "blocked", reason: "unavailable" };
      if (command.projectionMatches && (command.value ? shoot.data?.title === command.value : !shoot.data)) return { outcome: "unchanged" };
      dispatched = true;
      const response = await fetch(target, { credentials: "include", redirect: "error", signal: sourceSignal,
        ...(command.value ? { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: { title: command.value } }) } : { method: "DELETE" }) });
      return response.ok ? { outcome: "acknowledged" } : await failure(response, true);
    }
    if (command.operation === "edit-rights") {
      const resource = rightsResourceSchema.safeParse(body);
      if (!resource.success) return { outcome: "blocked", reason: "unavailable" };
      const action = resource.data.data.metadata.actions.find(item => item.name === "set-from-usage-rights" && item.method === "POST");
      const target = gridServiceUrl("metadata", resource.data.data.usageRights.uri, `${path}/usage-rights`, origin);
      const derived = gridServiceUrl("metadata", action?.href, `${path}/metadata/set-from-usage-rights`, origin);
      const before = metadataWriteFingerprint(resource.data.data.metadata.data);
      if (!target || !derived || !before || !observeRights) return { outcome: "blocked", reason: "unavailable" };
      dispatched = true;
      const response = await fetch(target, { credentials: "include", redirect: "error", method: "PUT", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs),
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: command.value.category ? command.value : {} }) });
      if (!response.ok) return failure(response, true);
      const fields: string[] = [];
      const visible = await observeRights(command, before, metadata => {
        if (!("creator" in command.value)) return;
        if (metadata.byline !== command.value.creator) fields.push("metadata_byline");
        if (metadata.credit !== command.value.publication) fields.push("metadata_credit");
        if (metadata.imageType !== (command.value.category === "publisher-photography" ? "Photograph" : "Illustration")) fields.push("metadata_imageType");
      }).catch(() => false);
      if (!visible) return { outcome: "acknowledged", metadataFromRights: "not-sent" };
      if (isGridSessionInvalidated() || !retainsEditGrant(command.imageId, command.resource)) return { outcome: "acknowledged", metadataFromRights: "not-sent" };
      try {
        if (fields.length) onDerivedDispatch?.(command.imageId, fields);
        const metadata = await fetch(derived, { credentials: "include", redirect: "error", method: "POST", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs) });
        if (!metadata.ok) {
          const failed = await failure(metadata, true);
          return { outcome: "acknowledged", metadataFromRights: failed.outcome === "rejected" ? "rejected" : "unknown", status: metadata.status };
        }
        const fingerprint = metadataWriteFingerprint((await metadata.json()).data);
        return { outcome: "acknowledged", metadataFromRights: fingerprint === undefined ? "unknown" : "acknowledged", metadataWitness: fingerprint };
      } catch { return { outcome: "acknowledged", metadataFromRights: "unknown" }; }
    }
    if (command.operation === "edit-metadata") {
      const resource = metadataResourceSchema.safeParse(body);
      const target = resource.success ? gridServiceUrl("metadata", resource.data.data.metadata.uri, `${path}/metadata`, origin) : undefined;
      const change = resource.success && original ? metadataChange(command, original, resource.data.data.metadata.data) : undefined;
      if (!target || !change) return { outcome: "blocked", reason: "invalid-command" };
      expected = change.expected;
      if (change.unchanged) return { outcome: "unchanged", expected,
        metadataWitness: metadataWriteFingerprint(resource.success ? resource.data.data.metadata.data : undefined) };
      dispatched = true;
      const result = await fetch(target, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs),
        method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: change.replacement }) });
      if (result.ok) {
        const confirmed = await result.json().catch(() => undefined);
        const fingerprint = metadataWriteFingerprint(confirmed?.data);
        return { outcome: "acknowledged", expected, ...(fingerprint !== undefined && { metadataWitness: fingerprint }) };
      }
      const failed = await failure(result, true);
      return failed.outcome === "unknown" ? { ...failed, expected } : failed;
    }
    const resource = labelsResourceSchema.safeParse(body);
    let target = resource.success ? gridServiceUrl("metadata", resource.data.data.labels.uri, `${path}/labels`, origin) : undefined;
    if (command.operation === "edit-label-list") {
      const source = removalResourceSchema.safeParse(body);
      if (!target || !source.success || command.clear && (command.add.length || command.remove.length)) return { outcome: "blocked", reason: "invalid-command" };
      const members = source.data.data.labels.data;
      const remove = new Set(command.remove), add = new Set(command.add), current = new Set(members.map(member => member.data));
      const deletions = members.filter(member => command.clear || remove.has(member.data) && !add.has(member.data)).map(member => {
        const suffix = new URLSearchParams({ label: member.data }).toString().slice(6);
        const memberPath = `${path}/labels/${suffix}`;
        return { label: member.data, url: isLabelRemovalRequest("DELETE", memberPath) ? gridServiceUrl("metadata", member.uri, memberPath, origin) : undefined };
      });
      if (deletions.some(step => !addressableLabel(step.label))) return { outcome: "blocked", reason: "unaddressable-label" };
      if (deletions.some(step => !step.url)) return { outcome: "blocked", reason: "unavailable" };
      const additions = [...add].filter(value => !current.has(value));
      expected = { labels: command.clear ? [] : [...new Set([...current].filter(value => !remove.has(value)).concat([...add]))] };
      const steps = [...new Map(deletions.map(step => [step.url!, step.label])).entries()].map(([url, label]) =>
        ({ url, label: label as string | undefined, method: "DELETE", body: undefined as string | undefined }));
      if (additions.length) steps.push({ url: target, label: undefined, method: "POST", body: JSON.stringify({ data: additions }) });
      for (const [index, step] of steps.entries()) {
        const labelSteps = { acknowledged: index, rejected: 0, notSent: steps.length - index, uncertain: 0 };
        const reload = isGridSessionInvalidated();
        if (reload || sourceSignal.aborted || !retainsEditGrant(command.imageId, command.resource)) {
          const reason = reload ? "reload-required" : "unavailable";
          return index ? { outcome: "partial", reason, labelSteps, expected: { labels: [...current] } } : { outcome: "blocked", reason, labelSteps };
        }
        let failed: Awaited<ReturnType<typeof failure>> | undefined;
        try {
          const response = await fetch(step.url, { credentials: "include", redirect: "error", signal: sourceSignal, method: step.method,
            ...(step.body && { headers: { "Content-Type": "application/json" }, body: step.body }) });
          if (!response.ok) failed = await failure(response, true);
        } catch { failed = { outcome: "unknown" }; }
        labelSteps.notSent--;
        if (failed?.outcome === "rejected") {
          labelSteps.rejected++;
          return index ? { ...failed, outcome: "partial", labelSteps, expected: { labels: [...current] } } : { ...failed, labelSteps };
        }
        if (step.label !== undefined) current.delete(step.label);
        else for (const label of additions) current.add(label);
        if (failed) return { ...failed, labelSteps: { ...labelSteps, uncertain: 1 }, expected: { labels: [...current] } };
      }
      return { outcome: steps.length ? "acknowledged" : "unchanged", expected };
    }
    if (command.operation === "remove-label") {
      const removal = removalResourceSchema.safeParse(body);
      const matches = removal.success ? removal.data.data.labels.data.filter(item => item.data === command.label) : [];
      if (target && removal.success && matches.length === 0) return { outcome: "unchanged" };
      const encoded = new URLSearchParams({ label: command.label }).toString().slice("label=".length);
      const removalPath = `${path}/labels/${encoded}`;
      target = target && matches.length === 1 && isLabelRemovalRequest("DELETE", removalPath)
        ? gridServiceUrl("metadata", matches[0].uri, removalPath, origin) : undefined;
    }
    if (!target) return { outcome: "blocked", reason: "invalid-command" };
    dispatched = true;
    const result = await fetch(target, {
      credentials: "include", redirect: "error", signal: AbortSignal.timeout(BATCH_POLICY.commandTimeoutMs),
      ...(command.operation === "remove-label" ? { method: "DELETE" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: command.labels }) }),
    });
    return result.ok ? { outcome: "acknowledged" } : failure(result, true);
  } catch {
    return dispatched ? { outcome: "unknown", ...(expected && { expected }) } : { outcome: "blocked", reason: "unavailable" };
  }
}