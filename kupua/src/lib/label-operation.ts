import type { EnrichmentFields } from "@/stores/enrichment-store";
import type { AddLabelsCommand, GridCommandResult } from "./grid-commands";
import { findLink } from "@/dal/grid-api/argo";

export interface LabelTarget {
  resource?: EnrichmentFields["resource"];
  pending?: boolean;
}

export interface LabelIntent {
  action: "add" | "remove";
  label: string;
  targetIds: readonly string[];
}

export interface LabelEditContext {
  targetIds: readonly string[];
  targets: ReadonlyMap<string, LabelTarget>;
  pending?: boolean;
}

export function labelTargetCounts(context: LabelEditContext) {
  const ids = [...new Set(context.targetIds)];
  const counts = { selected: ids.length, eligible: 0, ineligible: 0, unresolved: 0 };
  for (const imageId of ids) {
    const target = context.targets.get(imageId);
    if (context.pending || target?.pending || !target?.resource) counts.unresolved++;
    else if (findLink(target.resource, "edits")) counts.eligible++;
    else counts.ineligible++;
  }
  return counts;
}

export interface LabelReceipt {
  readonly intent: Readonly<LabelIntent>;
  readonly mode: "disconnected" | "simulated";
  readonly counts: Readonly<{ selected: number; eligible: number; ineligible: number; unresolved: number }>;
  readonly blocked?: "read-only" | "capabilities" | "unsupported";
  readonly items: readonly Readonly<LabelItem>[];
}

interface LabelItem {
  imageId: string;
  state: "not-started" | "submitted" | "accepted-awaiting-visibility" | "observed" | "rejected" | "unknown";
  result?: Readonly<GridCommandResult>;
}

export function createLabelOperation(simulate?: (command: AddLabelsCommand) => Promise<GridCommandResult>) {
  let receipt: LabelReceipt | undefined;
  const listeners = new Set<() => void>();

  function publish(next: LabelReceipt) {
    receipt = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function updateItem(imageId: string, state: LabelItem["state"], result?: GridCommandResult) {
    if (!receipt) return;
    publish({ ...receipt, items: Object.freeze(receipt.items.map((item) => item.imageId === imageId
      ? Object.freeze({ imageId, state, ...(result && { result: Object.freeze({ ...result }) }) }) : item)) });
  }

  return {
    getSnapshot: () => receipt,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    observeSimulated(evidence: { imageId: string; label: string; present: boolean }): boolean {
      if (!simulate || !receipt || receipt.intent.action !== "add"
        || evidence.label !== receipt.intent.label || !evidence.present) return false;
      const item = receipt.items.find((candidate) => candidate.imageId === evidence.imageId);
      if (item?.state !== "accepted-awaiting-visibility") return false;
      updateItem(item.imageId, "observed", item.result);
      return true;
    },
    async confirm(input: LabelIntent, targets: ReadonlyMap<string, LabelTarget>): Promise<boolean> {
      if (receipt) return false;
      const label = input.label.trim();
      if (!label || !input.targetIds.length || input.targetIds.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) return false;
      const intent = Object.freeze({ ...input, label, targetIds: Object.freeze([...new Set(input.targetIds)]) });
      const counts = labelTargetCounts({ targetIds: intent.targetIds, targets });
      const blocked = import.meta.env.VITE_USE_MEDIA_API !== "true" ? "read-only"
        : counts.ineligible || counts.unresolved ? "capabilities"
        : simulate && intent.action === "remove" ? "unsupported" : undefined;
      const commands: AddLabelsCommand[] = simulate && !blocked ? intent.targetIds.map((imageId) => ({
        operation: "add-labels", imageId, labels: [label],
        resource: { links: targets.get(imageId)!.resource!.links.map(({ rel, href }) => ({ rel, href })) },
      })) : [];
      publish({
        intent,
        mode: simulate ? "simulated" : "disconnected",
        counts: Object.freeze(counts),
        blocked,
        items: Object.freeze(intent.targetIds.map((imageId) => Object.freeze({ imageId, state: "not-started" as const }))),
      });
      if (simulate && !blocked) {
        await Promise.all(commands.map(async (command) => {
          updateItem(command.imageId, "submitted");
          let result: GridCommandResult;
          try { result = await simulate(command); }
          catch { result = { outcome: "unknown" }; }
          const state = result.outcome === "acknowledged" ? "accepted-awaiting-visibility"
            : result.outcome === "blocked" ? "not-started" : result.outcome;
          updateItem(command.imageId, state, result);
        }));
      }
      return true;
    },
  };
}