import { z } from "zod";
import { findLink, parseArgoErrorBody } from "@/dal/grid-api/argo";
import { gridServiceUrl, mediaApiUrl } from "@/dal/grid-api/proxy-target";
import { getGridServiceOrigin, getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated } from "./grid-api-instance";
import { isLabelRemovalRequest } from "./grid-mutation-policy";
import { editingAllowedAtStartup } from "./editing-preference";
import { BATCH_POLICY } from "./batch-execution";
import { copyImageRead, getMetadataWriteWitness, retainsEditGrant } from "./image-read-freshness";

const addLabelsSchema = z.object({
  operation: z.literal("add-labels"),
  imageId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  resource: z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) }),
  labels: z.array(z.string().refine((value) => value.trim().length > 0)).min(1),
}).strict();
const removeLabelSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({
  operation: z.literal("remove-label"), label: z.string().refine(value => value.trim().length > 0),
}).strict();
const metadataCommandSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({
  operation: z.literal("edit-metadata"),
  fieldId: z.enum(["metadata_title", "metadata_description", "metadata_specialInstructions", "metadata_byline",
    "metadata_credit", "metadata_copyright", "metadata_dateTaken", "metadata_imageType", "metadata_keywords",
    "metadata_peopleInImage", "location"]),
  action: z.enum(["overwrite", "prepend", "append", "add", "remove", "if-empty"]),
  value: z.union([z.string(), z.object({ subLocation: z.string().optional(), city: z.string().optional(),
    state: z.string().optional(), country: z.string().optional() }).strict()]),
}).strict();
const commandSchema = z.discriminatedUnion("operation", [addLabelsSchema, removeLabelSchema, metadataCommandSchema]);
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

export type GridCommandResult =
  | { outcome: "blocked"; reason: "disabled" | "invalid-command" | "unavailable" | "reload-required" }
  | { outcome: "acknowledged"; expected?: MetadataExpected; metadataWitness?: string }
  | { outcome: "unchanged"; expected?: MetadataExpected; metadataWitness?: string }
  | { outcome: "rejected"; status: number; errorKey: string }
  | { outcome: "unknown"; status?: 429; expected?: MetadataExpected };

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
    if (command.action !== "overwrite" || typeof command.value === "string" || !Object.keys(command.value).length) return;
    Object.assign(expected, command.value);
  } else {
    if (typeof command.value !== "string") return;
    const field = command.fieldId.slice("metadata_".length);
    const current = overrides[field] ?? original[field];
    if (field === "keywords" || field === "peopleInImage") {
      if (!["overwrite", "add", "remove"].includes(command.action) || current !== undefined && !Array.isArray(current)) return;
      const values = command.action === "overwrite" ? [...new Set(command.value.split(",").map(value => value.trim()).filter(Boolean))]
        : command.value.trim() ? [command.value.trim()] : [];
      const existing = z.array(z.string()).safeParse(current ?? []);
      if (!existing.success) return;
      expected[field] = command.action === "add" ? [...new Set([...existing.data, ...values])]
        : command.action === "remove" ? existing.data.filter(value => !values.includes(value)) : values;
    } else {
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

async function failure(response: Response, dispatched: boolean): Promise<GridCommandResult> {
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

export async function executeGridCommand(input: unknown): Promise<GridCommandResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { outcome: "blocked", reason: "invalid-command" };
  const command = parsed.data;
  copyImageRead((input as { resource: object }).resource, command.resource);
  if (!gridLabelEditingEnabled()) return { outcome: "blocked", reason: "disabled" };
  if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
  const path = `/metadata/${command.imageId}`;
  const href = findLink(command.resource, "edits")?.href;
  const witness = command.operation === "edit-metadata" ? getMetadataWriteWitness(command.imageId) : undefined;
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