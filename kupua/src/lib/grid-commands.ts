import { z } from "zod";
import { findLink, parseArgoErrorBody } from "@/dal/grid-api/argo";
import { gridServiceUrl } from "@/dal/grid-api/proxy-target";
import { getGridServiceOrigin, getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated } from "./grid-api-instance";
import { isLabelRemovalRequest } from "./grid-mutation-policy";
import { editingAllowedAtStartup } from "./editing-preference";

const addLabelsSchema = z.object({
  operation: z.literal("add-labels"),
  imageId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  resource: z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) }),
  labels: z.array(z.string().refine((value) => value.trim().length > 0)).min(1),
}).strict();
const removeLabelSchema = addLabelsSchema.omit({ operation: true, labels: true }).extend({
  operation: z.literal("remove-label"), label: z.string().refine(value => value.trim().length > 0),
}).strict();
const commandSchema = z.discriminatedUnion("operation", [addLabelsSchema, removeLabelSchema]);
const labelsResourceSchema = z.object({ data: z.object({ labels: z.object({ uri: z.string() }) }) });
const removalResourceSchema = z.object({ data: z.object({ labels: z.object({
  uri: z.string(), data: z.array(z.object({ uri: z.string(), data: z.string() })),
}) }) });

export type AddLabelsCommand = z.infer<typeof addLabelsSchema>;
export type RemoveLabelCommand = z.infer<typeof removeLabelSchema>;
export type LabelCommand = AddLabelsCommand | RemoveLabelCommand;

export type GridCommandResult =
  | { outcome: "blocked"; reason: "disabled" | "invalid-command" | "unavailable" | "reload-required" }
  | { outcome: "acknowledged" }
  | { outcome: "unchanged" }
  | { outcome: "rejected"; status: number; errorKey: string }
  | { outcome: "unknown"; status?: 429 };

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
  if (!gridLabelEditingEnabled()) return { outcome: "blocked", reason: "disabled" };
  if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
  const path = `/metadata/${command.imageId}`;
  const href = findLink(command.resource, "edits")?.href;

  let dispatched = false;
  try {
    const origin = await getGridServiceOrigin("metadata");
    if (!origin) return { outcome: "blocked", reason: "unavailable" };
    const editsUrl = gridServiceUrl("metadata", href, path, origin);
    if (!editsUrl) return { outcome: "blocked", reason: "invalid-command" };
    const session = await getGridSessionPermissions();
    if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
    if (!session) return { outcome: "blocked", reason: "unavailable" };
    const response = await fetch(editsUrl, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return failure(response, false);
    const body: unknown = await response.json();
    if (isGridSessionInvalidated()) return { outcome: "blocked", reason: "reload-required" };
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
      credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000),
      ...(command.operation === "remove-label" ? { method: "DELETE" }
        : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: command.labels }) }),
    });
    return result.ok ? { outcome: "acknowledged" } : failure(result, true);
  } catch {
    return dispatched ? { outcome: "unknown" } : { outcome: "blocked", reason: "unavailable" };
  }
}