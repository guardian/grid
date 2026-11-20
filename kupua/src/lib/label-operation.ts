import { attachedEnrichment, type EnrichmentFields } from "@/stores/enrichment-store";
import type { LabelCommand, GridCommandResult } from "./grid-commands";
import { findLink } from "@/dal/grid-api/argo";
import type { Image } from "@/types/image";
import { acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, captureUnsentLabelTargets, ensureImageRead, fullProjectionMatches, getImageAvailability, getMetadataWriteWitness, hasNewerImageOperation, isLabelAuthorityCurrent, recordLabelOutcome, recordObservedMetadataWitness, releaseLabelObservation } from "./image-read-freshness";
import { BATCH_POLICY, createBatchExecution } from "./batch-execution";

export interface LabelTarget {
  resource?: EnrichmentFields["resource"];
  pending?: boolean;
}

export interface LabelIntent {
  action: "add" | "remove";
  label: string;
  targetIds: readonly string[];
}

export function validLabelIntent(input: LabelIntent): boolean {
  return Boolean(input.label.trim() && input.targetIds.length && input.targetIds.every(id => /^[a-zA-Z0-9_-]+$/.test(id)));
}

export interface LabelEditContext {
  targetIds: readonly string[];
  targets: ReadonlyMap<string, LabelTarget>;
  pending?: boolean;
}

export function labelTargetCounts(context: LabelEditContext) {
  const ids = [...new Set(context.targetIds)];
  const counts = { selected: ids.length, eligible: 0, ineligible: 0, unresolved: 0, unavailable: 0 };
  for (const imageId of ids) {
    const target = context.targets.get(imageId);
    if (getImageAvailability(imageId)) counts.unavailable++;
    else if (context.pending || target?.pending || !target?.resource) counts.unresolved++;
    else if (findLink(target.resource, "edits")) {
      if (isLabelAuthorityCurrent(imageId, target.resource)) counts.eligible++;
      else counts.unresolved++;
    }
    else counts.ineligible++;
  }
  return counts;
}

export interface ImageEditReceipt<Intent> {
  readonly intent: Readonly<Intent>;
  readonly mode: "disconnected" | "simulated" | "connected";
  readonly counts: Readonly<{ selected: number; eligible: number; ineligible: number; unresolved: number; unavailable: number }>;
  readonly blocked?: "read-only" | "capabilities" | "unsupported" | "busy" | "target-limit" | "freshness-capacity" | "conflict";
  readonly items: readonly Readonly<LabelItem>[];
}

export type LabelReceipt = ImageEditReceipt<LabelIntent>;

interface LabelItem {
  imageId: string;
  state: "not-started" | "queued" | "stopped" | "submitted" | "accepted-awaiting-visibility" | "unchanged" | "rejected" | "unknown";
  result?: Readonly<GridCommandResult>;
  observation?: "pending" | "observed" | "deadline" | "unavailable" | "superseded";
}

export interface LabelObservation {
  readImages: (ids: string[], signal: AbortSignal) => Promise<Image[]>;
  publishImages: (images: Image[]) => void;
  standalone?: () => LabelStandaloneOwner | undefined;
  publicationReady?: (image: Image) => boolean;
}

export interface LabelStandaloneOwner {
  imageId: string;
  isCurrent: () => boolean;
  read: (signal: AbortSignal) => Promise<Image | undefined>;
  unavailable: () => void;
}

export function createLabelOperation(
  simulate?: (command: LabelCommand) => Promise<GridCommandResult>,
  observation?: LabelObservation,
  mode: "simulated" | "connected" = "simulated",
  execution?: { wait?: Promise<void>; pacing: { nextStart: number } },
) {
  return createImageEditOperation<LabelIntent, LabelCommand>({
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

export function createImageEditOperation<Intent extends { targetIds: readonly string[] }, Command extends { imageId: string }>(
  behavior: {
    valid: (intent: Intent) => boolean;
    normalize: (intent: Intent) => Intent;
    unsupported: (intent: Intent) => boolean;
    command: (intent: Intent, imageId: string, resource: NonNullable<LabelTarget["resource"]>) => Command;
    matches: (image: Image, intent: Intent, result: GridCommandResult | undefined) => boolean;
    metadataWitness?: (image: Image, intent: Intent) => string | undefined;
    dispatchConcurrency?: number;
  },
  simulate?: (command: Command) => Promise<GridCommandResult>,
  observation?: LabelObservation,
  mode: "simulated" | "connected" = "simulated",
  execution?: { wait?: Promise<void>; pacing: { nextStart: number }; continueAfterLocalBlock?: boolean },
) {
  const batched = mode === "connected";
  let receipt: ImageEditReceipt<Intent> | undefined;
  const listeners = new Set<() => void>();
  let observe = () => {};
  let cancelObservation = () => {};
  let operationId: number | undefined;
  const outcomes = new Map<string, GridCommandResult>();
  let stopRemaining = () => {};
  let stopTargets = (_ids: readonly string[]) => {};
  let finishDispatch = () => {};

  function matchesLabel(image: Image): boolean {
    return behavior.matches(image, receipt!.intent, receipt!.items.find(item => item.imageId === image.id)?.result);
  }

  function publish(next: ImageEditReceipt<Intent>) {
    receipt = Object.freeze(next);
    for (const listener of listeners) listener();
  }

  function recordOutcome(imageId: string, result: GridCommandResult) {
    const queued = outcomes.size > 0;
    outcomes.set(imageId, result);
    if (queued) return;
    queueMicrotask(() => {
      if (!receipt) return;
      publish({ ...receipt, items: Object.freeze(receipt.items.map(item => {
        const result = outcomes.get(item.imageId);
        if (!result) return item;
        const state = result.outcome === "acknowledged" ? "accepted-awaiting-visibility"
          : result.outcome === "blocked" ? "not-started" : result.outcome;
        return Object.freeze({ ...item, state, result: Object.freeze({ ...result }) });
      })) });
      outcomes.clear();
      observe();
    });
  }

  function startObservation() {
    if (!observation || !receipt) return;
    const controller = new AbortController();
    const verified = new Map<string, Image>();
    const published = new Set<string>();
    const unavailable = new Set<string>();
    const superseded = new Set<string>();
    let fullAttempted = false;
    let fullPending: { image: Image; owner: LabelStandaloneOwner } | undefined;
    let settled = false;
    let running = false;
    let attempts = 0;
    let lastAttempt = -Infinity;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let dispatching = batched;
    const hardDeadlineAt = Date.now() + BATCH_POLICY.observationWindowMs + (batched ? BATCH_POLICY.dispatchDeadlineMs : 0);
    let deadlineAt = hardDeadlineAt;
    let deadline = setTimeout(() => finish("deadline"), deadlineAt - Date.now());

    function publishVerified() {
      const accepted = acceptObservedImages([...verified.values()].filter(image => !published.has(image.id)
        && (observation!.publicationReady?.(image) ?? true)), operationId!);
      if (accepted.length) observation!.publishImages(accepted);
      for (const image of accepted) {
        published.add(image.id);
        recordObservedMetadataWitness(operationId!, image.id, behavior.metadataWitness?.(image, receipt!.intent));
      }
      for (const image of verified.values()) {
        if (!published.has(image.id) && hasNewerImageOperation(image.id, operationId!)
          && (observation!.publicationReady?.(image) ?? true)) verified.delete(image.id);
      }
    }

    finishDispatch = () => {
      if (settled) return;
      dispatching = false;
      clearTimeout(deadline);
      deadlineAt = Math.min(hardDeadlineAt, Date.now() + BATCH_POLICY.observationWindowMs);
      deadline = setTimeout(() => finish("deadline"), Math.max(0, deadlineAt - Date.now()));
      observe();
    };

    function finish(reason: "deadline" | "unavailable" | "superseded") {
      if (settled || !receipt) return;
      settled = true;
      stopRemaining();
      clearTimeout(deadline);
      clearTimeout(retry);
      controller.abort();
      observe = () => {};
      cancelObservation = () => {};
      if (fullPending) {
        if (!fullPending.owner.isCurrent()) verified.set(fullPending.image.id, fullPending.image);
        else fullPending.owner.unavailable();
      }
      publishVerified();
      releaseLabelObservation(operationId!);
      publish({ ...receipt, items: Object.freeze(receipt.items.map(item => Object.freeze({
        ...item,
        ...(item.observation === "pending" && {
          observation: published.has(item.imageId) ? "observed" as const : superseded.has(item.imageId) ? "superseded" as const : unavailable.has(item.imageId) ? "unavailable" as const
            : verified.has(item.imageId) ? "superseded" as const : reason,
        }),
      }))) });
      verified.clear();
    }

    cancelObservation = () => {
      verified.clear();
      fullPending = undefined;
      finish("superseded");
    };

    observe = () => {
      if (settled || running || !receipt) return;
      if (dispatching && attempts > 0) return;
      const queued = receipt.items.some(item => item.state === "queued");
      const ids = receipt.items.filter(item => !verified.has(item.imageId) && !unavailable.has(item.imageId) && !superseded.has(item.imageId)
        && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged" || item.state === "unknown"))
        .map(item => item.imageId);
      const submitted = queued || receipt.items.some(item => item.state === "submitted");
      if (!ids.length) {
        if (!submitted) finish("unavailable");
        return;
      }
      if (!batched && attempts === BATCH_POLICY.observationAttempts) { finish("deadline"); return; }
      const delay = lastAttempt + BATCH_POLICY.observationIntervalMs - Date.now();
      if (delay > 0) {
        clearTimeout(retry);
        retry = setTimeout(() => observe(), delay);
        return;
      }
      attempts++;
      lastAttempt = Date.now();
      running = true;
      const issued = captureImageRead();
      void observation!.readImages(ids, controller.signal).then(async images => {
        if (settled || !receipt) return;
        for (const image of images) {
          if (!ids.includes(image.id)) continue;
          const overlay = attachedEnrichment(image);
          ensureImageRead(image, issued, "lean", overlay);
          if (overlay) acceptImageOverlay(image.id, overlay);
          if (matchesLabel(image)) {
            const owner = observation!.standalone?.();
            if (owner?.imageId === image.id && owner.isCurrent()) {
              if (!fullAttempted) {
                fullAttempted = true;
                fullPending = { image, owner };
              } else {
                unavailable.add(image.id);
                owner.unavailable();
              }
            } else verified.set(image.id, image);
          } else if (hasNewerImageOperation(image.id, operationId!)) {
            const witness = getMetadataWriteWitness(image.id);
            if (typeof witness === "string" && behavior.metadataWitness?.(image, receipt.intent) === witness) superseded.add(image.id);
          }
        }
        if (fullPending) {
          const pending = fullPending;
          let full: Image | undefined;
          try { full = await pending.owner.read(controller.signal); }
          catch { full = undefined; }
          if (settled || !receipt) return;
          fullPending = undefined;
          if (!pending.owner.isCurrent()) verified.set(pending.image.id, pending.image);
          else if (full && full.id === pending.image.id && matchesLabel(full)
            && fullProjectionMatches(full, pending.image)) verified.set(full.id, full);
          else {
            unavailable.add(pending.image.id);
            pending.owner.unavailable();
          }
        }
        if (batched) publishVerified();
        running = false;
        observe();
      }, () => {
        if (settled) return;
        if (execution?.continueAfterLocalBlock && dispatching) {
          for (const id of ids) unavailable.add(id);
          running = false;
          observe();
        } else finish("unavailable");
      });
    };
    publish({ ...receipt, items: Object.freeze(receipt.items.map(item => Object.freeze({
      ...item, observation: "pending" as const,
    }))) });
  }

  return {
    getSnapshot: () => receipt,
    subscribe(listener: () => void) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    cancelObservation: () => cancelObservation(),
    stopRemaining: () => stopRemaining(),
    stopTargets: (ids: readonly string[]) => stopTargets(ids),
    async confirm(input: Intent, targets: ReadonlyMap<string, LabelTarget>): Promise<boolean> {
      if (receipt) return false;
      if (!behavior.valid(input)) return false;
      const intent = Object.freeze({ ...behavior.normalize(input), targetIds: Object.freeze([...new Set(input.targetIds)]) });
      const counts = labelTargetCounts({ targetIds: intent.targetIds, targets });
      let blocked: LabelReceipt["blocked"] = import.meta.env.VITE_USE_MEDIA_API !== "true" ? "read-only"
        : counts.ineligible || counts.unresolved || counts.unavailable ? "capabilities"
        : simulate && (batched ? intent.targetIds.length > BATCH_POLICY.maxTargets
          : behavior.unsupported(intent)) ? "target-limit" : undefined;
      let restoreUnsent: ReturnType<typeof captureUnsentLabelTargets> | undefined;
      if (simulate && observation && !blocked && !execution?.wait) {
        if (batched) restoreUnsent = captureUnsentLabelTargets(intent.targetIds);
        const admission = admitLabelObservation(intent.targetIds);
        if (typeof admission === "number") operationId = admission;
        else blocked = admission;
      }
      const commands: Command[] = simulate && !blocked ? intent.targetIds.map(imageId => behavior.command(intent, imageId,
        { links: targets.get(imageId)!.resource!.links.map(({ rel, href }) => ({ rel, href })) })) : [];
      publish({
        intent,
        mode: simulate ? mode : "disconnected",
        counts: Object.freeze(counts),
        blocked,
        items: Object.freeze(intent.targetIds.map((imageId) => Object.freeze({ imageId,
          state: commands.length ? batched ? "queued" as const : "submitted" as const : "not-started" as const }))),
      });
      if (simulate && !blocked) {
        if (execution?.wait) {
          let stopped = false;
          const capturedTargets = new Map(intent.targetIds.map(imageId => [imageId, targets.get(imageId)!]));
          stopRemaining = () => {
            stopped = true;
            publish({ ...receipt!, items: Object.freeze(receipt!.items.map(item => Object.freeze({ ...item, state: "stopped" as const }))) });
          };
          await execution.wait;
          if (stopped) return true;
          const current = labelTargetCounts({ targetIds: intent.targetIds, targets: capturedTargets });
          if (current.ineligible || current.unresolved || current.unavailable) blocked = "capabilities";
          if (!blocked && observation) {
            restoreUnsent = captureUnsentLabelTargets(intent.targetIds);
            const admission = admitLabelObservation(intent.targetIds);
            if (typeof admission === "number") operationId = admission;
            else blocked = admission;
          }
          if (blocked) {
            publish({ ...receipt!, blocked, items: Object.freeze(receipt!.items.map(item => Object.freeze({ ...item, state: "not-started" as const }))) });
            return true;
          }
        }
        const execute = async (command: Command) => {
          let result: GridCommandResult;
          try { result = await simulate(command); }
          catch { result = { outcome: "unknown" }; }
          const metadataWitness = "operation" in command && command.operation === "edit-metadata"
            && (result.outcome === "acknowledged" || result.outcome === "unchanged") ? result.metadataWitness ?? null : undefined;
          if (operationId !== undefined) recordLabelOutcome(operationId, command.imageId, result.outcome, metadataWitness);
          const reported = { ...result };
          if ("metadataWitness" in reported) delete reported.metadataWitness;
          recordOutcome(command.imageId, reported);
          return result;
        };
        if (batched) {
          const dispatch = createBatchExecution(commands, async command => {
            const result = await execute(command);
            return { stop: result.outcome === "blocked" && (!execution?.continueAfterLocalBlock || result.reason === "disabled" || result.reason === "reload-required")
              || "status" in result && (result.status === 401 || result.status === 419),
              throttled: "status" in result && result.status === 429 };
          }, {
            stopped: unsent => {
              if (operationId !== undefined) restoreUnsent?.(operationId, unsent.map(command => command.imageId));
              const stoppedIds = new Set(unsent.map(command => command.imageId));
              publish({ ...receipt!, items: Object.freeze(receipt!.items.map(item => item.state === "queued" && stoppedIds.has(item.imageId)
                ? Object.freeze({ ...item, state: "stopped" as const, observation: undefined }) : item)) });
              observe();
            },
            started: command => {
              publish({ ...receipt!, items: Object.freeze(receipt!.items.map(item => item.imageId === command.imageId
                ? Object.freeze({ ...item, state: "submitted" as const }) : item)) });
            },
          }, execution?.pacing ?? { nextStart: 0 }, behavior.dispatchConcurrency);
          stopRemaining = dispatch.stopRemaining;
          stopTargets = ids => {
            const selected = new Set(ids);
            dispatch.stopMatching(command => selected.has(command.imageId));
          };
          startObservation();
          dispatch.start();
          await dispatch.done;
          finishDispatch();
        } else {
          startObservation();
          await Promise.all(commands.map(execute));
        }
        if (operationId !== undefined) restoreUnsent?.(operationId, []);
      }
      return true;
    },
  };
}