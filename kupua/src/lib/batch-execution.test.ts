import { describe, expect, it } from "vitest";
import { canLendEdit, createBatchQueue, editEffect } from "./batch-execution";

const parent = { ids: new Set(["inside"]), effect: "image" as const };
const candidate = { imageId: "outside", effect: "rights" as const, sequence: 20, conflicted: () => false };

describe("batch queue handoff", () => {
  it("classifies connected fields and excludes overlapping image or shoot-rights effects", () => {
    expect(["photoshoot", "usageRights_category", "metadata_title", "metadata_future"].map(field => editEffect(field)))
      .toEqual(["shoot-rights", "rights", "image", "unknown"]);
    const unknown = editEffect("future");
    expect(canLendEdit({ ...parent, effect: unknown }, { ...candidate, effect: "image" })).toBe(false);
    expect(canLendEdit(parent, { ...candidate, effect: unknown })).toBe(false);
    const effects = ["image", "rights", "shoot-rights"] as const;
    expect(effects.map(effect => effects.map(other => canLendEdit({ ...parent, effect }, { ...candidate, effect: other }))))
      .toEqual([[true, true, true], [true, true, false], [true, false, false]]);
    expect(canLendEdit(parent, { ...candidate, imageId: "inside" })).toBe(false);
  });

  it("wakes the earlier admitted child as lent and resumes only on completion", async () => {
    const queue = createBatchQueue();
    const owner = queue.admit()!;
    let conflict = true;
    const child = queue.admit({ ...candidate, conflicted: () => conflict })!;
    const atWake = child.wait!.then(() => child.isLent);
    expect(queue.lendWaiting(owner, parent)).toBeUndefined();
    conflict = false;
    expect(queue.lendWaiting(owner, parent, candidate.sequence)).toBeUndefined();
    expect(queue.lendWaiting(child, parent)).toBeUndefined();
    expect(queue.lendWaiting(owner, { ...parent, effect: "shoot-rights" })).toBeUndefined();
    const turn = queue.lendWaiting(owner, parent, candidate.sequence + 1);
    expect(turn).toBeInstanceOf(Promise);
    expect(await atWake).toBe(true);
    let resumed = false;
    void turn!.then(() => { resumed = true; });
    child.dispatched();
    await Promise.resolve();
    expect(resumed).toBe(false);
    expect(queue.admit()).toBeUndefined();
    expect(queue.lendWaiting(owner, parent)).toBeUndefined();
    child.complete("reload-required");
    await expect(turn).resolves.toBe("reload-required");
    const next = queue.admit()!;
    expect(next.wait).toBeInstanceOf(Promise);
    expect(queue.lendWaiting(owner, parent)).toBeUndefined();
    owner.dispatched();
    await next.wait;
    expect(next.isLent).toBe(false);
  });

  it("defers an early owner release until the lent child completes", async () => {
    const queue = createBatchQueue();
    const owner = queue.admit()!;
    const child = queue.admit(candidate)!;
    const turn = queue.lendWaiting(owner, parent);
    owner.dispatched();
    owner.complete();
    child.dispatched();
    expect(queue.admit()).toBeUndefined();
    child.complete();
    await expect(turn).resolves.toBeUndefined();
    const next = queue.admit()!;
    expect(next.wait).toBeUndefined();
    expect(queue.borrowTurn(next, () => {})).toBeDefined();
  });

  it("unblocks the lender as disabled on disposal without reopening admission", async () => {
    const queue = createBatchQueue();
    const owner = queue.admit()!;
    const child = queue.admit(candidate)!;
    const turn = queue.lendWaiting(owner, parent);
    queue.dispose();
    await expect(turn).resolves.toBe("disabled");
    child.complete();
    expect(queue.admit()).toBeUndefined();
  });

  it("wakes a private lender on disposal even before its child completes", () => {
    const queue = createBatchQueue();
    let resumed = false;
    const child = queue.borrowTurn(queue.admit()!, () => { resumed = true; })!;
    queue.dispose();
    expect(resumed).toBe(true);
    child.complete();
    expect(queue.admit()).toBeUndefined();
  });
});