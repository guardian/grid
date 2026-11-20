import { createImageEditOperation, type ImageEditReceipt, type LabelObservation } from "./label-operation";
import { metadataWriteFingerprint, type AddLabelsCommand, type GridCommandResult, type MetadataCommand } from "./grid-commands";
import type { BatchPacing } from "./batch-execution";

export type MetadataIntent = (Pick<MetadataCommand, "fieldId" | "action" | "value">
  | { fieldId: "labels"; action: "add"; value: string }) & { targetIds: readonly string[] };
export type MetadataReceipt = ImageEditReceipt<MetadataIntent>;

export function createMetadataOperation(
  execute: (command: MetadataCommand | AddLabelsCommand) => Promise<GridCommandResult>,
  observation: LabelObservation,
  execution?: { wait?: Promise<void>; pacing: BatchPacing; continueAfterLocalBlock?: boolean; dispatchConcurrency?: number },
  perImageIntents?: ReadonlyMap<string, MetadataIntent>,
) {
  return createImageEditOperation<MetadataIntent, MetadataCommand | AddLabelsCommand>({
    dispatchConcurrency: execution?.dispatchConcurrency,
    valid: intent => intent.targetIds.length > 0 && intent.targetIds.every(id => /^[a-zA-Z0-9_-]+$/.test(id)),
    normalize: intent => intent.fieldId === "labels" ? { ...intent }
      : { ...intent, value: typeof intent.value === "string" ? intent.value : Object.freeze({ ...intent.value }) },
    unsupported: () => false,
    metadataWitness: (image, input) => (perImageIntents?.get(image.id) ?? input).fieldId === "labels"
      ? undefined : metadataWriteFingerprint(image.userMetadata?.metadata),
    command: (input, imageId, resource) => {
      const intent = perImageIntents?.get(imageId) ?? input;
      return intent.fieldId === "labels"
        ? { operation: "add-labels", imageId, resource, labels: [intent.value] }
        : { operation: "edit-metadata", imageId, resource, fieldId: intent.fieldId, action: intent.action, value: intent.value };
    },
    matches: (image, intent, result) => {
      intent = perImageIntents?.get(image.id) ?? intent;
      if (intent.fieldId === "labels") return image.userMetadata?.labels?.includes(intent.value) === true;
      if (!result || !("expected" in result) || !result.expected) return false;
      return Object.entries(result.expected).every(([field, expected]) => {
        const actual = image.metadata[field as keyof typeof image.metadata];
        if (field === "dateTaken" && typeof expected === "string" && typeof actual === "string") return Date.parse(actual) === Date.parse(expected);
        if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every(value => actual.includes(value));
        return (actual ?? "") === expected;
      });
    },
  }, execute, observation, "connected", execution);
}