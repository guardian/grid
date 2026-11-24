import { attachedEnrichment, type EnrichmentFields } from "@/stores/enrichment-store";
import type { GridCommandResult } from "./grid-commands";
import { findLink } from "@/dal/grid-api/argo";
import type { Image } from "@/types/image";
import { acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, captureUnsentLabelTargets, copyImageRead, ensureImageRead, fullProjectionMatches, getImageAvailability, getMetadataWriteWitness, hasNewerImageOperation, isLabelAuthorityCurrent, recordLabelOutcome, recordObservedMetadataWitness, releaseLabelObservation, retainsEditGrant } from "./image-read-freshness";
import { BATCH_POLICY, createBatchExecution } from "./batch-execution";

export interface MetadataEditTarget {
  resource?: EnrichmentFields["resource"];
  pending?: boolean;
}

let editSequence = 0;
export function nextEditSequence() { return ++editSequence; }

export function labelStepStatus(result?: GridCommandResult): string | undefined {
  if (!result || !("labelSteps" in result) || !result.labelSteps) return;
  const { acknowledged, rejected, notSent, uncertain } = result.labelSteps;
  return [acknowledged && `${acknowledged} acknowledged`, rejected && `${rejected} rejected`,
    uncertain && `${uncertain} uncertain`, notSent && `${notSent} not sent`].filter(Boolean).join(", ");
}

export function sessionStopReason(result?: GridCommandResult): "disabled" | "reload-required" | undefined {
  if (result?.outcome === "partial" && result.reason === "reload-required") return result.reason;
  if (result?.outcome === "blocked" && (result.reason === "disabled" || result.reason === "reload-required")) return result.reason;
  if (result && "status" in result && (result.status === 401 || result.status === 419)) return "reload-required";
}

export interface MetadataEditContext {
  targetIds: readonly string[];
  targets: ReadonlyMap<string, MetadataEditTarget>;
  pending?: boolean;
}

export function captureMetadataEditTargets(ids: readonly string[], targets: ReadonlyMap<string, MetadataEditTarget>) {
  return new Map(ids.map(id => {
    const source = targets.get(id)!.resource!;
    const resource = { links: source.links.map(({ rel, href }) => ({ rel, href })) };
    copyImageRead(source, resource);
    return [id, { resource }] as const;
  }));
}

export function metadataEditTargetCounts(context: MetadataEditContext, captured = false) {
  const ids = [...new Set(context.targetIds)];
  const counts = { selected: ids.length, eligible: 0, ineligible: 0, unresolved: 0, unavailable: 0 };
  for (const imageId of ids) {
    const target = context.targets.get(imageId);
    if (getImageAvailability(imageId)) counts.unavailable++;
    else if (context.pending || target?.pending || !target?.resource) counts.unresolved++;
    else if (findLink(target.resource, "edits")) {
      if (isLabelAuthorityCurrent(imageId, target.resource, captured)) counts.eligible++;
      else counts.unresolved++;
    }
    else counts.ineligible++;
  }
  return counts;
}

export interface MetadataEditReceipt<Intent> {
  readonly intent: Readonly<Intent>;
  readonly mode: "disconnected" | "simulated" | "connected";
  readonly counts: Readonly<{ selected: number; eligible: number; ineligible: number; unresolved: number; unavailable: number }>;
  readonly blocked?: "read-only" | "capabilities" | "unsupported" | "busy" | "target-limit" | "freshness-capacity" | "conflict";
  readonly items: readonly Readonly<MetadataEditItem>[];
}

interface MetadataEditItem {
  imageId: string;
  state: "not-started" | "queued" | "stopped" | "submitted" | "accepted-awaiting-visibility" | "unchanged" | "partial" | "rejected" | "unknown";
  result?: Readonly<GridCommandResult>;
  observation?: "pending" | "observed" | "deadline" | "unavailable" | "superseded";
  reloadRequired?: true;
}

export interface MetadataEditObservation {
  onReadError?: (error: unknown) => boolean;
  readImages: (ids: string[], signal: AbortSignal) => Promise<Image[]>;
  publishImages: (images: Image[]) => void;
  standalone?: () => MetadataEditStandaloneOwner | undefined;
  publicationReady?: (image: Image) => boolean;
}

export interface MetadataEditStandaloneOwner {
  imageId: string;
  isCurrent: () => boolean;
  read: (signal: AbortSignal) => Promise<Image | undefined>;
  unavailable: () => void;
}

export function createMetadataEditExecution<Intent extends { targetIds: readonly string[] }, Command extends { imageId: string }>(
  behavior: {
    valid: (intent: Intent) => boolean;
    normalize: (intent: Intent) => Intent;
    unsupported: (intent: Intent) => boolean;
    command: (intent: Intent, imageId: string, resource: NonNullable<MetadataEditTarget["resource"]>) => Command;
    matches: (image: Image, intent: Intent, result: GridCommandResult | undefined) => boolean;
    metadataWitness?: (image: Image, intent: Intent) => string | undefined;
    dispatchConcurrency?: number;
  },
  simulate?: (command: Command) => Promise<GridCommandResult>,
  observation?: MetadataEditObservation,
  mode: "simulated" | "connected" = "simulated",
  execution?: { wait?: Promise<void>; pacing: { nextStart: number }; continueAfterLocalBlock?: boolean; captured?: boolean },
) {
  const batched = mode === "connected";
  let receipt: MetadataEditReceipt<Intent> | undefined;
  const listeners = new Set<() => void>();
  let observe = () => {};
  let cancelObservation = () => {};
  let operationId: number | undefined;
  const outcomes = new Map<string, GridCommandResult>();
  let stopRemaining = () => {};
  let stopTargets = (_ids: readonly string[]) => {};
  let finishDispatch = () => {};

  function matchesExpectedMetadata(image: Image): boolean {
    return behavior.matches(image, receipt!.intent, receipt!.items.find(item => item.imageId === image.id)?.result);
  }

  function publish(next: MetadataEditReceipt<Intent>) {
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
        return Object.freeze({ ...item, state, result: Object.freeze({ ...result }),
          ...(item.observation === "pending" && (state === "rejected" || state === "not-started") && { observation: "unavailable" as const }) });
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
    let fullPending: { image: Image; owner: MetadataEditStandaloneOwner } | undefined;
    let settled = false;
    let running = false;
    let attempts = 0;
    let reloadRequired = false;
    let lastAttempt = -Infinity;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let dispatching = batched;
    const hardDeadlineAt = Date.now() + BATCH_POLICY.observationWindowMs + (batched ? BATCH_POLICY.dispatchDeadlineMs : 0);
    let deadlineAt = hardDeadlineAt;
    let deadline = setTimeout(() => finish("deadline"), deadlineAt - Date.now());

    function publishVerified() {
      const ready = [...verified.values()].filter(image => !published.has(image.id)
        && (observation!.publicationReady?.(image) ?? true));
      const accepted = acceptObservedImages(ready, operationId!, image => {
        const result = receipt?.items.find(item => item.imageId === image.id)?.result;
        return !!result && "expectedLeases" in result;
      });
      if (accepted.length) observation!.publishImages(accepted);
      for (const image of accepted) {
        published.add(image.id);
        recordObservedMetadataWitness(operationId!, image.id, behavior.metadataWitness?.(image, receipt!.intent));
      }
      for (const image of ready) if (!published.has(image.id)) verified.delete(image.id);
      if (!settled && receipt && (accepted.length || superseded.size) && receipt.items.some(item => item.observation === "pending" && (published.has(item.imageId) || superseded.has(item.imageId)))) {
        publish({ ...receipt, items: Object.freeze(receipt.items.map(item => {
          if (item.observation !== "pending") return item;
          if (published.has(item.imageId)) return Object.freeze({ ...item, observation: "observed" as const });
          if (superseded.has(item.imageId)) return Object.freeze({ ...item, observation: "superseded" as const });
          return item;
        })) });
      }
      return accepted.length < ready.length;
    }

    finishDispatch = () => {
      if (settled) return;
      dispatching = false;
      clearTimeout(deadline);
      deadlineAt = Math.min(hardDeadlineAt, Date.now() + BATCH_POLICY.observationWindowMs);
      deadline = setTimeout(() => finish("deadline"), Math.max(0, deadlineAt - Date.now()));
      observe();
    };

    function standaloneUnavailable(owner: MetadataEditStandaloneOwner, reason: "deadline" | "unavailable" | "superseded" = "unavailable") {
      if (hasNewerImageOperation(owner.imageId, operationId!)) superseded.add(owner.imageId);
      else {
        if (reason === "unavailable") unavailable.add(owner.imageId);
        owner.unavailable();
      }
    }

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
        else standaloneUnavailable(fullPending.owner, reason);
      }
      publishVerified();
      releaseLabelObservation(operationId!);
      publish({ ...receipt, items: Object.freeze(receipt.items.map(item => Object.freeze({
        ...item,
        ...(item.observation === "pending" && {
          ...(reloadRequired && { reloadRequired: true as const }),
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
        && (item.state === "accepted-awaiting-visibility" || item.state === "unchanged" || item.state === "partial" || item.state === "unknown"))
        .map(item => item.imageId);
      const submitted = queued || receipt.items.some(item => item.state === "submitted");
      if (!ids.length) {
        if (!submitted) {
          if (!batched && publishVerified()) observe();
          else finish("unavailable");
        }
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
          if (matchesExpectedMetadata(image)) {
            const owner = observation!.standalone?.();
            if (owner?.imageId === image.id && owner.isCurrent()) {
              if (!fullAttempted) {
                fullAttempted = true;
                fullPending = { image, owner };
              } else standaloneUnavailable(owner);
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
          catch (error) { reloadRequired = observation!.onReadError?.(error) === true; full = undefined; }
          if (settled || !receipt) return;
          fullPending = undefined;
          const overlay = full && attachedEnrichment(full);
          if (full?.id === pending.image.id && overlay) acceptImageOverlay(full.id, overlay);
          if (!pending.owner.isCurrent()) verified.set(pending.image.id, pending.image);
          else if (full && full.id === pending.image.id && matchesExpectedMetadata(full)
            && fullProjectionMatches(full, pending.image)) verified.set(full.id, full);
          else standaloneUnavailable(pending.owner);
        }
        if (batched) publishVerified();
        running = false;
        observe();
      }, (error: unknown) => {
        if (settled) return;
        reloadRequired = observation!.onReadError?.(error) === true;
        if (reloadRequired) { finish("unavailable"); return; }
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
    async confirm(input: Intent, targets: ReadonlyMap<string, MetadataEditTarget>): Promise<boolean> {
      if (receipt) return false;
      if (!behavior.valid(input)) return false;
      const intent = Object.freeze({ ...behavior.normalize(input), targetIds: Object.freeze([...new Set(input.targetIds)]) });
      const counts = metadataEditTargetCounts({ targetIds: intent.targetIds, targets }, execution?.captured);
      let blocked: MetadataEditReceipt<Intent>["blocked"] = import.meta.env.VITE_USE_MEDIA_API !== "true" ? "read-only"
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
      const capturedTargets = captureMetadataEditTargets(simulate && !blocked ? intent.targetIds : [], targets);
      const commands = [...capturedTargets].map(([imageId, target]) => behavior.command(intent, imageId, target.resource));
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
          stopRemaining = () => {
            stopped = true;
            publish({ ...receipt!, items: Object.freeze(receipt!.items.map(item => Object.freeze({ ...item, state: "stopped" as const }))) });
          };
          await execution.wait;
          if (stopped) return true;
          const current = metadataEditTargetCounts({ targetIds: intent.targetIds, targets: capturedTargets }, true);
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
          try { result = mode === "connected" && !retainsEditGrant(command.imageId, capturedTargets.get(command.imageId)!.resource)
            ? { outcome: "blocked", reason: "unavailable" } : await simulate(command); }
          catch { result = { outcome: "unknown" }; }
          const metadataWitness = "operation" in command && (command.operation === "edit-metadata" || command.operation === "edit-rights")
            && (result.outcome === "acknowledged" || result.outcome === "unchanged") ? result.metadataWitness ?? null : undefined;
          const uncertainMetadata = result.outcome === "acknowledged" && result.metadataFromRights === "unknown";
          if (operationId !== undefined) recordLabelOutcome(operationId, command.imageId, uncertainMetadata ? "unknown" : result.outcome === "partial" ? "acknowledged" : result.outcome, metadataWitness);
          const reported = { ...result };
          if ("metadataWitness" in reported) delete reported.metadataWitness;
          recordOutcome(command.imageId, reported);
          return result;
        };
        if (batched) {
          const dispatch = createBatchExecution(commands, async command => {
            const result = await execute(command);
            return { stop: !!sessionStopReason(result) || result.outcome === "blocked" && !execution?.continueAfterLocalBlock,
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