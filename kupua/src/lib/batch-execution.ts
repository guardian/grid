export const BATCH_POLICY = Object.freeze({
  maxTargets: 100,
  concurrency: 3,
  startIntervalMs: 250,
  maxQueued: 1,
  dispatchDeadlineMs: 120_000,
  observationWindowMs: 10_000,
  observationAttempts: 3,
  observationIntervalMs: 1_000,
  throttleDelayMs: 1_000,
});

export interface BatchPacing { nextStart: number }

interface BatchSlot {
  wait?: Promise<void>;
  pacing: BatchPacing;
  complete: () => void;
  release: () => void;
}

export function createBatchQueue() {
  let active: BatchSlot | undefined;
  let closed = false;
  const waiting: BatchSlot[] = [];
  const pacing = { nextStart: 0 };
  return {
    admit(): BatchSlot | undefined {
      if (closed || active && waiting.length >= BATCH_POLICY.maxQueued) return undefined;
      let release = () => {};
      let completed = false;
      const slot: BatchSlot = {
        wait: active ? new Promise<void>(resolve => { release = resolve; }) : undefined,
        pacing,
        release: () => release(),
        complete() {
          if (completed) return;
          completed = true;
          if (active === slot) {
            active = closed ? undefined : waiting.shift();
            active?.release();
          } else {
            const index = waiting.indexOf(slot);
            if (index >= 0) waiting.splice(index, 1);
          }
          release();
        },
      };
      if (active) waiting.push(slot); else active = slot;
      return slot;
    },
    dispose() {
      closed = true;
      for (const slot of waiting.splice(0)) slot.release();
      active = undefined;
    },
  };
}

export function createBatchExecution<T>(
  items: readonly T[],
  execute: (item: T) => Promise<{ stop: boolean; throttled: boolean }>,
  hooks: { started: (item: T) => void; stopped: (unsent: readonly T[]) => void },
  pacing: BatchPacing,
) {
  let next = 0;
  let active = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let deadline: ReturnType<typeof setTimeout> | undefined;
  let resolve!: () => void;
  const done = new Promise<void>(complete => { resolve = complete; });
  const finish = () => {
    if (next === items.length && active === 0) {
      clearTimeout(timer);
      clearTimeout(deadline);
      resolve();
    }
  };
  const stopRemaining = () => {
    clearTimeout(timer);
    clearTimeout(deadline);
    const unsent = items.slice(next);
    next = items.length;
    if (unsent.length) hooks.stopped(unsent);
    finish();
  };
  const pump = () => {
    clearTimeout(timer);
    if (next === items.length || active === BATCH_POLICY.concurrency) { finish(); return; }
    const delay = pacing.nextStart - Date.now();
    if (delay > 0) { timer = setTimeout(pump, delay); return; }
    const item = items[next++];
    active++;
    pacing.nextStart = Date.now() + BATCH_POLICY.startIntervalMs;
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
    start() { deadline = setTimeout(stopRemaining, BATCH_POLICY.dispatchDeadlineMs); pump(); },
  };
}