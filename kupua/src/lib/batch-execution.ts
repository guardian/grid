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

interface BatchSlot {
  wait?: Promise<void>;
  pacing: BatchPacing;
  dispatched: () => void;
  complete: () => void;
  release: () => void;
}

export function createBatchQueue() {
  let active: BatchSlot | undefined;
  let closed = false;
  const waiting: BatchSlot[] = [];
  const retained = new Set<BatchSlot>();
  const pacing = { nextStart: 0 };
  const listeners = new Set<() => void>();
  return {
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    admit(): BatchSlot | undefined {
      if (closed || retained.size >= BATCH_POLICY.maxQueued + 1) return undefined;
      let release = () => {};
      let completed = false;
      const slot: BatchSlot = {
        wait: active ? new Promise<void>(resolve => { release = resolve; }) : undefined,
        pacing,
        release: () => release(),
        dispatched() {
          if (active === slot) {
            active = closed ? undefined : waiting.shift();
            active?.release();
          } else {
            const index = waiting.indexOf(slot);
            if (index >= 0) waiting.splice(index, 1);
          }
          release();
          for (const listener of listeners) queueMicrotask(listener);
        },
        complete() {
          if (completed) return;
          completed = true;
          retained.delete(slot);
          slot.dispatched();
        },
      };
      retained.add(slot);
      if (active) waiting.push(slot); else active = slot;
      return slot;
    },
    dispose() {
      closed = true;
      for (const slot of waiting.splice(0)) slot.release();
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