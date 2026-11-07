import { z } from "zod";
import { findLink, parseArgoErrorBody } from "@/dal/grid-api/argo";
import { gridServiceOrigin, gridServiceUrl } from "@/dal/grid-api/proxy-target";
import { getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated } from "./grid-api-instance";
import { hostedMutationRollout, isHostedBuild } from "./hosted-config";
import { admitsLabelAdd, admitsLabelRemoval, isLabelRemovalRequest, mutationRolloutFromEnv } from "./grid-mutation-policy";

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
  | { outcome: "rejected"; status: number; errorKey: string }
  | { outcome: "unknown" };

let stopped = false;

export function stopGridMutations(): void {
  stopped = true;
}

function blockReason(operation: LabelCommand["operation"]): "disabled" | "reload-required" | undefined {
  if (stopped || isGridSessionInvalidated()) return "reload-required";
  const rollout = isHostedBuild() ? hostedMutationRollout() : mutationRolloutFromEnv(import.meta.env);
  if (import.meta.env.VITE_USE_MEDIA_API !== "true"
    || !(operation === "remove-label" ? admitsLabelRemoval(rollout) : admitsLabelAdd(rollout))) return "disabled";
  return undefined;
}

async function failure(response: Response, dispatched: boolean): Promise<GridCommandResult> {
  if (response.status === 401 || response.status === 419) invalidateGridSession();
  if (dispatched && ![401, 403, 419, 422].includes(response.status)) return { outcome: "unknown" };
  const body: unknown = await response.json().catch(() => null);
  return { outcome: "rejected", status: response.status, errorKey: parseArgoErrorBody(body).errorKey };
}

export function gridLabelEditingEnabled(): boolean {
  return Boolean(gridServiceOrigin("metadata") && gridServiceOrigin("auth"))
    && (!blockReason("add-labels") || !blockReason("remove-label"));
}

export async function executeGridCommand(input: unknown): Promise<GridCommandResult> {
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { outcome: "blocked", reason: "invalid-command" };
  const command = parsed.data;
  const blocked = blockReason(command.operation);
  if (blocked) return { outcome: "blocked", reason: blocked };
  const path = `/metadata/${command.imageId}`;
  const href = findLink(command.resource, "edits")?.href;
  const editsUrl = gridServiceUrl("metadata", href, path);
  if (!editsUrl || !gridServiceOrigin("auth")) return { outcome: "blocked", reason: "invalid-command" };

  let dispatched = false;
  try {
    const session = await getGridSessionPermissions();
    const afterSession = blockReason(command.operation);
    if (afterSession) return { outcome: "blocked", reason: afterSession };
    if (!session) return { outcome: "blocked", reason: "unavailable" };
    const response = await fetch(editsUrl, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return failure(response, false);
    const body: unknown = await response.json();
    const resource = labelsResourceSchema.safeParse(body);
    let target = resource.success ? gridServiceUrl("metadata", resource.data.data.labels.uri, `${path}/labels`) : undefined;
    if (command.operation === "remove-label") {
      const removal = removalResourceSchema.safeParse(body);
      const matches = removal.success ? removal.data.data.labels.data.filter(item => item.data === command.label) : [];
      const encoded = new URLSearchParams({ label: command.label }).toString().slice("label=".length);
      const removalPath = `${path}/labels/${encoded}`;
      target = target && matches.length === 1 && isLabelRemovalRequest("DELETE", removalPath)
        ? gridServiceUrl("metadata", matches[0].uri, removalPath) : undefined;
    }
    const beforeDispatch = blockReason(command.operation);
    if (beforeDispatch) return { outcome: "blocked", reason: beforeDispatch };
    if (!target || editsUrl !== gridServiceUrl("metadata", href, path)) return { outcome: "blocked", reason: "invalid-command" };
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