import { attachedEnrichment, type EnrichmentFields } from "@/stores/enrichment-store";
import type { LabelCommand, GridCommandResult } from "./grid-commands";
import { findLink } from "@/dal/grid-api/argo";
import type { Image } from "@/types/image";
import { acceptImageOverlay, acceptObservedImages, admitLabelObservation, captureImageRead, ensureImageRead, fullProjectionMatches, getImageAvailability, isLabelAuthorityCurrent, recordLabelOutcome, releaseLabelObservation } from "./image-read-freshness";

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

export interface LabelReceipt {
  readonly intent: Readonly<LabelIntent>;
  readonly mode: "disconnected" | "simulated" | "connected";
  readonly counts: Readonly<{ selected: number; eligible: number; ineligible: number; unresolved: number; unavailable: number }>;
  readonly blocked?: "read-only" | "capabilities" | "unsupported" | "busy" | "target-limit" | "freshness-capacity" | "conflict";
  readonly items: readonly Readonly<LabelItem>[];
}

interface LabelItem {
  imageId: string;
  state: "not-started" | "submitted" | "accepted-awaiting-visibility" | "rejected" | "unknown";
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
) {
  let receipt: LabelReceipt | undefined;
  const listeners = new Set<() => void>();
  let observe = () => {};
  let cancelObservation = () => {};
  let operationId: number | undefined;
  const outcomes = new Map<string, GridCommandResult>();

  function matchesLabel(image: Image): boolean {
    const labels = image.userMetadata?.labels;
    return Array.isArray(labels) && (receipt!.intent.action === "remove"
      ? !labels.includes(receipt!.intent.label) : labels.includes(receipt!.intent.label));
  }

  function publish(next: LabelReceipt) {
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
    const unavailable = new Set<string>();
    let fullAttempted = false;
    let fullPending: { image: Image; owner: LabelStandaloneOwner } | undefined;
    let settled = false;
    let running = false;
    let attempts = 0;
    let lastAttempt = -Infinity;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const deadline = setTimeout(() => finish("deadline"), 10_000);

    function finish(reason: "deadline" | "unavailable" | "superseded") {
      if (settled || !receipt) return;
      settled = true;
      clearTimeout(deadline);
      clearTimeout(retry);
      controller.abort();
      observe = () => {};
      cancelObservation = () => {};
      if (fullPending) {
        if (!fullPending.owner.isCurrent()) verified.set(fullPending.image.id, fullPending.image);
        else fullPending.owner.unavailable();
      }
      const accepted = acceptObservedImages([...verified.values()].filter(image => observation!.publicationReady?.(image) ?? true), operationId!);
      if (accepted.length) observation!.publishImages(accepted);
      const published = new Set(accepted.map(image => image.id));
      releaseLabelObservation(operationId!);
      publish({ ...receipt, items: Object.freeze(receipt.items.map(item => Object.freeze({
        ...item,
        ...(item.observation === "pending" && {
          observation: published.has(item.imageId) ? "observed" as const : unavailable.has(item.imageId) ? "unavailable" as const
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
      const ids = receipt.items.filter(item => !verified.has(item.imageId) && !unavailable.has(item.imageId)
        && (item.state === "accepted-awaiting-visibility" || item.state === "unknown"))
        .map(item => item.imageId);
      const submitted = receipt.items.some(item => item.state === "submitted");
      if (!ids.length) {
        if (!submitted) finish("unavailable");
        return;
      }
      if (attempts === 3) { finish("deadline"); return; }
      const delay = lastAttempt + 1_000 - Date.now();
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
        running = false;
        observe();
      }, () => { if (!settled) finish("unavailable"); });
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
    async confirm(input: LabelIntent, targets: ReadonlyMap<string, LabelTarget>): Promise<boolean> {
      if (receipt) return false;
      const label = input.action === "remove" ? input.label : input.label.trim();
      if (!label.trim() || !input.targetIds.length || input.targetIds.some((id) => !/^[a-zA-Z0-9_-]+$/.test(id))) return false;
      const intent = Object.freeze({ ...input, label, targetIds: Object.freeze([...new Set(input.targetIds)]) });
      const counts = labelTargetCounts({ targetIds: intent.targetIds, targets });
      let blocked: LabelReceipt["blocked"] = import.meta.env.VITE_USE_MEDIA_API !== "true" ? "read-only"
        : counts.ineligible || counts.unresolved || counts.unavailable ? "capabilities"
        : simulate && (mode === "connected" || intent.action === "remove") && intent.targetIds.length !== 1 ? "target-limit" : undefined;
      if (simulate && observation && !blocked) {
        const admission = admitLabelObservation(intent.targetIds);
        if (typeof admission === "number") operationId = admission;
        else blocked = admission;
      }
      const commands: LabelCommand[] = simulate && !blocked ? intent.targetIds.map((imageId) => ({
        ...(intent.action === "remove" ? { operation: "remove-label" as const, label }
          : { operation: "add-labels" as const, labels: [label] }), imageId,
        resource: { links: targets.get(imageId)!.resource!.links.map(({ rel, href }) => ({ rel, href })) },
      })) : [];
      publish({
        intent,
        mode: simulate ? mode : "disconnected",
        counts: Object.freeze(counts),
        blocked,
        items: Object.freeze(intent.targetIds.map((imageId) => Object.freeze({ imageId,
          state: commands.length ? "submitted" as const : "not-started" as const }))),
      });
      if (simulate && !blocked) {
        startObservation();
        await Promise.all(commands.map(async (command) => {
          let result: GridCommandResult;
          try { result = await simulate(command); }
          catch { result = { outcome: "unknown" }; }
          if (operationId !== undefined) recordLabelOutcome(operationId, command.imageId, result.outcome);
          recordOutcome(command.imageId, result);
        }));
      }
      return true;
    },
  };
}