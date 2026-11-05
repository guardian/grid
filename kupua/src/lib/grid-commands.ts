import { z } from "zod";
import { findLink, parseArgoErrorBody } from "@/dal/grid-api/argo";
import { gridServiceOrigin, gridServiceUrl } from "@/dal/grid-api/proxy-target";
import { getGridSessionPermissions, invalidateGridSession, isGridSessionInvalidated } from "./grid-api-instance";
import { hostedMutationRollout, isHostedBuild } from "./hosted-config";
import { admitsLabelAdd, mutationRolloutFromEnv } from "./grid-mutation-policy";

const commandSchema = z.object({
  operation: z.literal("add-labels"),
  imageId: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  resource: z.object({ links: z.array(z.object({ rel: z.string(), href: z.string() })) }),
  labels: z.array(z.string().refine((value) => value.trim().length > 0)).min(1),
}).strict();
const labelsResourceSchema = z.object({ data: z.object({ labels: z.object({ uri: z.string() }) }) });

export type AddLabelsCommand = z.infer<typeof commandSchema>;

export type GridCommandResult =
  | { outcome: "blocked"; reason: "disabled" | "invalid-command" | "unavailable" | "reload-required" }
  | { outcome: "acknowledged" }
  | { outcome: "rejected"; status: number; errorKey: string }
  | { outcome: "unknown" };

let stopped = false;

export function stopGridMutations(): void {
  stopped = true;
}

function blockReason(): "disabled" | "reload-required" | undefined {
  if (stopped || isGridSessionInvalidated()) return "reload-required";
  const rollout = isHostedBuild() ? hostedMutationRollout() : mutationRolloutFromEnv(import.meta.env);
  if (import.meta.env.VITE_USE_MEDIA_API !== "true" || !admitsLabelAdd(rollout)) return "disabled";
  return undefined;
}

async function failure(response: Response, dispatched: boolean): Promise<GridCommandResult> {
  if (response.status === 401 || response.status === 419) invalidateGridSession();
  if (dispatched && ![401, 403, 419, 422].includes(response.status)) return { outcome: "unknown" };
  const body: unknown = await response.json().catch(() => null);
  return { outcome: "rejected", status: response.status, errorKey: parseArgoErrorBody(body).errorKey };
}

export async function executeGridCommand(input: unknown): Promise<GridCommandResult> {
  const blocked = blockReason();
  if (blocked) return { outcome: "blocked", reason: blocked };
  const parsed = commandSchema.safeParse(input);
  if (!parsed.success) return { outcome: "blocked", reason: "invalid-command" };
  const command = parsed.data;
  const path = `/metadata/${command.imageId}`;
  const href = findLink(command.resource, "edits")?.href;
  const editsUrl = gridServiceUrl("metadata", href, path);
  if (!editsUrl || !gridServiceOrigin("auth")) return { outcome: "blocked", reason: "invalid-command" };

  let dispatched = false;
  try {
    const session = await getGridSessionPermissions();
    const afterSession = blockReason();
    if (afterSession) return { outcome: "blocked", reason: afterSession };
    if (!session) return { outcome: "blocked", reason: "unavailable" };
    const response = await fetch(editsUrl, { credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000) });
    if (!response.ok) return failure(response, false);
    const resource = labelsResourceSchema.safeParse(await response.json());
    const target = resource.success ? gridServiceUrl("metadata", resource.data.data.labels.uri, `${path}/labels`) : undefined;
    const beforeDispatch = blockReason();
    if (beforeDispatch) return { outcome: "blocked", reason: beforeDispatch };
    if (!target || editsUrl !== gridServiceUrl("metadata", href, path)) return { outcome: "blocked", reason: "invalid-command" };
    dispatched = true;
    const result = await fetch(target, {
      method: "POST", credentials: "include", redirect: "error", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json" }, body: JSON.stringify({ data: command.labels }),
    });
    return result.ok ? { outcome: "acknowledged" } : failure(result, true);
  } catch {
    return dispatched ? { outcome: "unknown" } : { outcome: "blocked", reason: "unavailable" };
  }
}