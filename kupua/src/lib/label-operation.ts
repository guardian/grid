import type { GridCommandResult, LabelCommand } from "./grid-commands";
import { createMetadataEditExecution, type MetadataEditReceipt, type MetadataEditObservation } from "./metadata-edit-execution";

export interface LabelIntent {
  action: "add" | "remove";
  label: string;
  targetIds: readonly string[];
}

export type LabelReceipt = MetadataEditReceipt<LabelIntent> & { sequence?: number };

export function validLabelIntent(input: LabelIntent): boolean {
  return Boolean(input.label.trim() && input.targetIds.length && input.targetIds.every(id => /^[a-zA-Z0-9_-]+$/.test(id)));
}

export function createLabelOperation(
  simulate?: (command: LabelCommand) => Promise<GridCommandResult>,
  observation?: MetadataEditObservation,
  mode: "simulated" | "connected" = "simulated",
  execution?: { wait?: Promise<void>; pacing: { nextStart: number }; captured?: boolean },
) {
  return createMetadataEditExecution<LabelIntent, LabelCommand>({
    valid: validLabelIntent,
    dispatchConcurrency: 8,
    normalize: input => ({ ...input, label: input.action === "remove" ? input.label : input.label.trim() }),
    unsupported: intent => intent.action === "remove" && intent.targetIds.length !== 1,
    command: (intent, imageId, resource) => ({
      ...(intent.action === "remove" ? { operation: "remove-label" as const, label: intent.label }
        : { operation: "add-labels" as const, labels: [intent.label] }), imageId, resource,
    }),
    matches: (image, intent) => {
      const labels = image.userMetadata?.labels;
      return Array.isArray(labels) && (intent.action === "remove" ? !labels.includes(intent.label) : labels.includes(intent.label));
    },
  }, simulate, observation, mode, execution);
}