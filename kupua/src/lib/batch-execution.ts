import type { MetadataIntent } from "./metadata-operation";

export const BATCH_POLICY = Object.freeze({
  speed: Object.freeze({
    concurrency: 3,
    startIntervalMs: 0,
  }),
  maxTargets: 100,
  maxQueued: 1,
  maxObservationTargets: 200,
  maxTouchedImages: 10_000,
  commandTimeoutMs: 15_000,
  sourceReadAttempts: 3,
  sourceReadIntervalMs: 100,
  dispatchDeadlineMs: 120_000,
  observationWindowMs: 10_000,
  observationAttempts: 3,
  observationIntervalMs: 500,
  throttleDelayMs: 1_000,
});

export interface BatchPacing { nextStart: number }

export type EditEffect = "image" | "shoot-rights" | "rights" | "unknown";
type ParentEdit = { ids: ReadonlySet<string>; effect: EditEffect };
type SingleEdit = { imageId: string; effect: EditEffect };
type Candidate = SingleEdit & { sequence: number; conflicted: () => boolean };
type Halt = "disabled" | "reload-required";

const fieldEffects = {
  metadata_title: "image", metadata_description: "image", metadata_specialInstructions: "image", metadata_byline: "image",
  metadata_credit: "image", metadata_copyright: "image", metadata_dateTaken: "image", metadata_imageType: "image",
  metadata_keywords: "image", metadata_peopleInImage: "image", metadata_subjects: "image", location: "image",
  archived: "image", collections: "image", labels: "image", leases: "image", photoshoot: "shoot-rights", usageRights_category: "rights",
} satisfies Record<MetadataIntent["fieldId"], Exclude<EditEffect, "unknown">>;

export function editEffect(fieldId: string): EditEffect {
  return Object.hasOwn(fieldEffects, fieldId) ? fieldEffects[fieldId as keyof typeof fieldEffects] : "unknown";
}

export function canLendEdit(parent: ParentEdit, candidate: SingleEdit): boolean {
  if (parent.ids.has(candidate.imageId)) return false;
  switch (parent.effect) {
    case "image": return candidate.effect === "image" || candidate.effect === "rights" || candidate.effect === "shoot-rights";
    case "rights": return candidate.effect === "image" || candidate.effect === "rights";
    case "shoot-rights": return candidate.effect === "image";
    default: return false;
  }
}

interface BatchSlot {
  wait?: Promise<void>;
  isLent: boolean;
  pacing: BatchPacing;
  dispatched: () => void;
  complete: (halt?: Halt) => void;
  release: () => void;
}

export function createBatchQueue() {
  let active: BatchSlot | undefined;
  let closed = false;
  const waiting: { slot: BatchSlot; sequence?: number; candidate?: Candidate }[] = [];
  let loan: { child: BatchSlot; resume: (halt?: Halt) => void; ownerDispatched?: boolean; ownerCompleted?: boolean } | undefined;
  const retained = new Set<BatchSlot>();
  let privateWake: ((halt?: Halt) => void) | undefined;
  const pacing = { nextStart: 0 };
  const listeners = new Map<() => void, (() => number | undefined) | undefined>();
  return {
    subscribe(listener: () => void, privateHead?: () => number | undefined) {
      listeners.set(listener, privateHead);
      return () => { listeners.delete(listener); };
    },
    hasEarlierWaiter(sequence: number) {
      const earlier = waiting[0]?.sequence;
      return earlier !== undefined && earlier < sequence;
    },
    borrowTurn(owner: BatchSlot, resume: (halt?: Halt) => void): BatchSlot | undefined {
      if (closed || active !== owner || retained.size !== 1 || waiting.length) return undefined;
      privateWake = resume;
      const slot: BatchSlot = {
        pacing, isLent: false, release: resume, dispatched: resume,
        complete() {
          if (!retained.delete(slot)) return;
          privateWake = undefined;
          resume();
          for (const listener of listeners.keys()) queueMicrotask(listener);
        },
      };
      retained.add(slot);
      return slot;
    },
    lendWaiting(owner: BatchSlot, parent: ParentEdit, privateHeadSequence?: number): Promise<Halt | undefined> | undefined {
      const head = waiting[0];
      const candidate = head?.candidate;
      if (closed || active !== owner || loan || !candidate ||
          (privateHeadSequence !== undefined && candidate.sequence >= privateHeadSequence) ||
          !canLendEdit(parent, candidate) || candidate.conflicted()) return undefined;
      return new Promise(resolve => {
        waiting.shift();
        loan = { child: head.slot, resume: resolve };
        head.slot.isLent = true;
        head.slot.release();
      });
    },
    admit(entry?: Candidate | { sequence: number }): BatchSlot | undefined {
      if (closed || retained.size >= BATCH_POLICY.maxQueued + 1) return undefined;
      if (entry) for (const head of listeners.values()) {
        const reserved = head?.();
        if (reserved !== undefined && reserved < entry.sequence) return undefined;
      }
      let release = () => {};
      let completed = false;
      const slot: BatchSlot = {
        wait: active ? new Promise<void>(resolve => { release = resolve; }) : undefined,
        pacing, isLent: false,
        release: () => release(),
        dispatched() {
          if (loan && active === slot) { loan.ownerDispatched = true; return; }
          if (slot.isLent) return;
          if (active === slot) {
            active = closed ? undefined : waiting.shift()?.slot;
            active?.release();
          } else {
            const index = waiting.findIndex(entry => entry.slot === slot);
            if (index >= 0) waiting.splice(index, 1);
          }
          release();
          for (const listener of listeners.keys()) queueMicrotask(listener);
        },
        complete(halt) {
          if (completed) return;
          if (loan && active === slot) { loan.ownerCompleted = true; return; }
          completed = true;
          retained.delete(slot);
          if (loan?.child === slot) {
            const finished = loan;
            loan = undefined;
            finished.resume(halt);
            if (finished.ownerCompleted) active?.complete();
            else if (finished.ownerDispatched) active?.dispatched();
            for (const listener of listeners.keys()) queueMicrotask(listener);
            return;
          }
          slot.dispatched();
        },
      };
      retained.add(slot);
      if (active) waiting.push({ slot, sequence: entry?.sequence, candidate: entry && "imageId" in entry ? entry : undefined }); else active = slot;
      return slot;
    },
    dispose() {
      closed = true;
      for (const { slot } of waiting.splice(0)) slot.release();
      loan?.resume("disabled");
      loan = undefined;
      privateWake?.("disabled");
      privateWake = undefined;
      active = undefined;
      retained.clear();
      listeners.clear();
    },
  };
}

export function createBatchExecution<T>(
  items: readonly T[],
  execute: (item: T) => Promise<{ stop: boolean; throttled: boolean }>,
  hooks: { started: (item: T) => void; stopped: (unsent: readonly T[]) => void },
  pacing: BatchPacing,
  concurrency: number = BATCH_POLICY.speed.concurrency,
) {
  const work = [...items];
  let next = 0;
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let resolve!: () => void;
  const done = new Promise<void>(complete => { resolve = complete; });
  const finish = () => {
    if (next === work.length && active === 0) {
      clearTimeout(timer);
      clearTimeout(deadline);
      resolve();
    }
  };
  const stopRemaining = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    const unsent = work.slice(next);
    next = work.length;
    if (unsent.length) hooks.stopped(unsent);
    finish();
  };
  const pump = () => {
    clearTimeout(timer);
    if (next === work.length || active >= concurrency) { finish(); return; }
    const delay = pacing.nextStart - Date.now();
    if (delay > 0) { timer = setTimeout(pump, delay); return; }
    const item = work[next++];
    active++;
    pacing.nextStart = Date.now() + BATCH_POLICY.speed.startIntervalMs;
    hooks.started(item);
    void execute(item).then(result => {
      active--;
      if (result.throttled) pacing.nextStart = Math.max(pacing.nextStart, Date.now() + BATCH_POLICY.throttleDelayMs);
      if (result.stop) stopRemaining();
      pump();
    });
    pump();
  };
  return {
    done,
    stopRemaining,
    stopMatching(matches: (item: T) => boolean) {
      const unsent = work.slice(next).filter(matches);
      if (!unsent.length) return;
      const stopped = new Set(unsent);
      work.splice(next, work.length - next, ...work.slice(next).filter(item => !stopped.has(item)));
      hooks.stopped(unsent);
      finish();
    },
    start() { deadline = setTimeout(stopRemaining, BATCH_POLICY.dispatchDeadlineMs); pump(); },
  };
}