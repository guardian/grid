import { createMetadataEditExecution, type MetadataEditReceipt, type MetadataEditObservation } from "./metadata-edit-execution";
import { metadataWriteFingerprint, type AddLabelsCommand, type GridCommandResult, type MetadataCommand, type RightsCommand, type ObserveRights } from "./grid-commands";
import { BATCH_POLICY, type BatchPacing } from "./batch-execution";
import { attachedEnrichment } from "@/stores/enrichment-store";

export function createRightsReadback(readImages: MetadataEditObservation["readImages"]): ObserveRights {
  type Waiting = { rights: string | undefined; metadata: string; grant: string | undefined; resolve: (seen: boolean) => void; attempts: number; deadline: number; due: number; onMatch?: Parameters<ObserveRights>[2] };
  const waiting = new Map<string, Waiting>();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let running = false;
  function schedule() {
    if (running) return;
    clearTimeout(timer);
    if (waiting.size) timer = setTimeout(() => void check(), Math.max(0, Math.min(...[...waiting.values()].map(item => item.due)) - Date.now()));
  }
  async function check() {
    running = true;
    const entries = [...waiting].filter(([, item]) => item.due <= Date.now());
    if (!entries.length) { running = false; schedule(); return; }
    const remaining = Math.max(1, Math.min(...entries.map(([, item]) => item.deadline - Date.now())));
    try {
      const images = await readImages(entries.map(([id]) => id), AbortSignal.timeout(remaining));
      const byId = new Map(images.map(image => [image.id, image]));
      for (const [id, item] of entries) {
        const image = byId.get(id);
        if (Date.now() <= item.deadline && image && item.grant && attachedEnrichment(image)?.resource?.links.some(link => link.rel === "edits" && link.href === item.grant)
          && metadataWriteFingerprint(image.userMetadata?.usageRights) === item.rights
          && metadataWriteFingerprint(image.userMetadata?.metadata) === item.metadata) {
          item.onMatch?.(image.metadata); waiting.delete(id); item.resolve(true);
        }
      }
    } catch { /* A failed read cannot admit a write. */ }
    for (const [id, item] of entries) if (waiting.has(id)) {
      if (++item.attempts >= BATCH_POLICY.observationAttempts || Date.now() >= item.deadline) {
        waiting.delete(id); item.resolve(false);
      } else item.due = Date.now() + Math.max(BATCH_POLICY.observationIntervalMs, Math.floor((item.deadline - Date.now()) / (BATCH_POLICY.observationAttempts - item.attempts + 1)));
    }
    running = false; schedule();
  }
  return (command, metadata, onMatch) => new Promise(resolve => {
    waiting.set(command.imageId, { metadata, onMatch, rights: metadataWriteFingerprint(command.value.category ? command.value : {}),
      grant: command.resource.links.find(link => link.rel === "edits")?.href, resolve, attempts: 0, due: Date.now(), deadline: Date.now() + BATCH_POLICY.observationWindowMs });
    schedule();
  });
}

export type MetadataIntent = (Pick<MetadataCommand, "fieldId" | "action" | "value">
  | { fieldId: "usageRights_category"; action: "overwrite"; value: RightsCommand["value"] }
  | { fieldId: "labels"; action: "add"; value: string }) & { targetIds: readonly string[] };
export type MetadataReceipt = MetadataEditReceipt<MetadataIntent>;

export function createMetadataOperation(
  execute: (command: MetadataCommand | AddLabelsCommand | RightsCommand, observeRights?: ObserveRights, onDerivedDispatch?: import("./grid-commands").DerivedDispatch) => Promise<GridCommandResult>,
  observation: MetadataEditObservation,
  execution?: { wait?: Promise<void>; pacing: BatchPacing; continueAfterLocalBlock?: boolean; dispatchConcurrency?: number; onDerivedDispatch?: import("./grid-commands").DerivedDispatch },
  perImageIntents?: ReadonlyMap<string, MetadataIntent>,
) {
  const observeRights = createRightsReadback(observation.readImages);
  return createMetadataEditExecution<MetadataIntent, MetadataCommand | AddLabelsCommand | RightsCommand>({
    dispatchConcurrency: execution?.dispatchConcurrency,
    valid: intent => intent.targetIds.length > 0 && intent.targetIds.every(id => /^[a-zA-Z0-9_-]+$/.test(id)),
    normalize: intent => intent.fieldId === "usageRights_category" ? { ...intent, value: Object.freeze({ ...intent.value }) } : intent.fieldId === "labels" ? { ...intent }
      : { ...intent, value: typeof intent.value === "string" ? intent.value : Object.freeze({ ...intent.value }) },
    unsupported: () => false,
    metadataWitness: (image, input) => (perImageIntents?.get(image.id) ?? input).fieldId === "labels"
      ? undefined : metadataWriteFingerprint(image.userMetadata?.metadata),
    command: (input, imageId, resource) => {
      const intent = perImageIntents?.get(imageId) ?? input;
      if (intent.fieldId === "usageRights_category") return { operation: "edit-rights", imageId, resource, value: intent.value };
      return intent.fieldId === "labels"
        ? { operation: "add-labels", imageId, resource, labels: [intent.value] }
        : { operation: "edit-metadata", imageId, resource, fieldId: intent.fieldId, action: intent.action, value: intent.value };
    },
    matches: (image, intent, result) => {
      intent = perImageIntents?.get(image.id) ?? intent;
      if (intent.fieldId === "usageRights_category") {
        const value = intent.value;
        if (metadataWriteFingerprint(image.userMetadata?.usageRights) !== metadataWriteFingerprint(value.category ? value : {})) return false;
        if (result?.outcome === "acknowledged" && result.metadataFromRights === "acknowledged" && "creator" in value) {
          return image.metadata.byline === value.creator && image.metadata.credit === value.publication
            && image.metadata.imageType === (value.category === "publisher-photography" ? "Photograph" : "Illustration");
        }
        return true;
      }
      if (intent.fieldId === "labels") return image.userMetadata?.labels?.includes(intent.value) === true;
      if (!result || !("expected" in result) || !result.expected) return false;
      return Object.entries(result.expected).every(([field, expected]) => {
        const actual = image.metadata[field as keyof typeof image.metadata];
        if (field === "dateTaken" && typeof expected === "string" && typeof actual === "string") return Date.parse(actual) === Date.parse(expected);
        if (Array.isArray(expected)) return Array.isArray(actual) && expected.length === actual.length && expected.every(value => actual.includes(value));
        return (actual ?? "") === expected;
      });
    },
  }, command => command.operation === "edit-rights" ? execute(command, observeRights, execution?.onDerivedDispatch) : execute(command), observation, "connected", execution);
}