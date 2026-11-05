import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabelOperation, type LabelTarget } from "./label-operation";
import type { GridCommandResult } from "./grid-commands";

const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/first" }] };
const intent = { action: "add" as const, label: "news", targetIds: ["first"] };
const targets = new Map<string, LabelTarget>([["first", { resource }]]);

beforeEach(() => { vi.stubEnv("VITE_USE_MEDIA_API", "true"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("disconnected label operation", () => {
  it("captures immutable intent without calling a service even when rollout is enabled", async () => {
    vi.stubEnv("VITE_GRID_API_WRITES_ENABLED", "true");
    vi.stubEnv("VITE_GRID_API_OPERATIONS", "add-labels");
    const transport = vi.fn();
    vi.stubGlobal("fetch", transport);
    const input = { ...intent, targetIds: [...intent.targetIds] };
    const operation = createLabelOperation();
    await operation.confirm(input, targets);
    input.targetIds.push("later");
    input.label = "changed";
    expect(operation.getSnapshot()).toMatchObject({
      intent: { action: "add", label: "news", targetIds: ["first"] },
      counts: { selected: 1, eligible: 1, ineligible: 0, unresolved: 0 },
      items: [{ imageId: "first", state: "not-started" }],
      mode: "disconnected",
    });
    expect(transport).not.toHaveBeenCalled();
  });

  it("counts every selected ID and blocks the whole operation when capabilities are incomplete", async () => {
    const executor = vi.fn();
    const operation = createLabelOperation(executor);
    await operation.confirm({ ...intent, targetIds: ["first", "denied", "missing", "pending"] }, new Map([
      ...targets,
      ["denied", { resource: { links: [] } }],
      ["pending", { resource, pending: true }],
    ]));
    expect(operation.getSnapshot()).toMatchObject({
      blocked: "capabilities",
      counts: { selected: 4, eligible: 1, ineligible: 1, unresolved: 2 },
    });
    expect(executor).not.toHaveBeenCalled();
  });

  it("rejects empty input without consuming confirmation and keeps removal disconnected", async () => {
    const operation = createLabelOperation();
    expect(await operation.confirm({ ...intent, label: "  " }, targets)).toBe(false);
    expect(await operation.confirm({ ...intent, targetIds: [] }, targets)).toBe(false);
    expect(operation.getSnapshot()).toBeUndefined();
    expect(await operation.confirm({ ...intent, action: "remove" }, targets)).toBe(true);
    expect(operation.getSnapshot()).toMatchObject({ mode: "disconnected", items: [{ state: "not-started" }] });
    const executor = vi.fn();
    const unsupported = createLabelOperation(executor);
    await unsupported.confirm({ ...intent, action: "remove" }, targets);
    expect(unsupported.getSnapshot()?.blocked).toBe("unsupported");
    expect(executor).not.toHaveBeenCalled();
  });

  it("keeps direct-ES read-only even when supplied capabilities and a fake executor", async () => {
    vi.stubEnv("VITE_USE_MEDIA_API", "false");
    const executor = vi.fn();
    const operation = createLabelOperation(executor);
    await operation.confirm(intent, targets);
    expect(operation.getSnapshot()?.blocked).toBe("read-only");
    expect(executor).not.toHaveBeenCalled();
  });

  it("admits each captured fake command once and retains distinct held and partial outcomes", async () => {
    let acknowledge!: (result: GridCommandResult) => void;
    const executor = vi.fn()
      .mockImplementationOnce(() => new Promise<GridCommandResult>((resolve) => { acknowledge = resolve; }))
      .mockResolvedValueOnce({ outcome: "rejected", status: 403, errorKey: "permission-denied" })
      .mockRejectedValueOnce(new TypeError("response lost"));
    const operation = createLabelOperation(executor);
    const listener = vi.fn();
    const unsubscribe = operation.subscribe(listener);
    const input = { ...intent, targetIds: ["first", "second", "third"] };
    const ownedResource = structuredClone(resource);
    const ownedTargets = new Map(input.targetIds.map((imageId) => [imageId, {
      resource: imageId === "first" ? ownedResource
        : { links: [{ rel: "edits", href: `https://metadata.example.test/metadata/${imageId}` }] },
    }]));
    const completion = operation.confirm(input, ownedTargets);
    expect(executor).toHaveBeenCalledTimes(3);
    expect(operation.getSnapshot()?.items[0].state).toBe("submitted");
    expect(await operation.confirm({ ...intent, label: "different" }, targets)).toBe(false);
    input.targetIds.splice(0, 3, "new-selection");
    ownedResource.links.length = 0;
    ownedTargets.clear();
    expect(executor.mock.calls[0][0]).toEqual({ operation: "add-labels", imageId: "first", labels: ["news"], resource });
    acknowledge({ outcome: "acknowledged" });
    await completion;
    expect(operation.getSnapshot()?.items.map((item) => item.state)).toEqual([
      "accepted-awaiting-visibility", "rejected", "unknown",
    ]);
    expect(operation.getSnapshot()?.intent.targetIds).toEqual(["first", "second", "third"]);
    expect(executor).toHaveBeenCalledTimes(3);
    expect(listener).toHaveBeenCalled();
    unsubscribe();
  });

  it("retains expiry and not-started reload requirements without replay", async () => {
    const executor = vi.fn()
      .mockResolvedValueOnce({ outcome: "rejected", status: 419, errorKey: "authentication-expired" })
      .mockResolvedValueOnce({ outcome: "blocked", reason: "reload-required" });
    const expired = createLabelOperation(executor);
    await expired.confirm(intent, targets);
    expect(expired.getSnapshot()?.items[0]).toMatchObject({ state: "rejected", result: { status: 419 } });
    const subsequent = createLabelOperation(executor);
    await subsequent.confirm(intent, targets);
    expect(subsequent.getSnapshot()?.items[0]).toEqual({ imageId: "first", state: "not-started", result: { outcome: "blocked", reason: "reload-required" } });
    expect(executor).toHaveBeenCalledTimes(2);
  });

  it("requires explicit matching simulated evidence after acknowledgement to mark an item observed", async () => {
    const evidence = { imageId: "first", label: "news", present: true };
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }));
    expect(operation.observeSimulated(evidence)).toBe(false);
    await operation.confirm(intent, targets);
    expect(operation.getSnapshot()?.items[0].state).toBe("accepted-awaiting-visibility");
    expect(operation.observeSimulated({ ...evidence, imageId: "other" })).toBe(false);
    expect(operation.observeSimulated({ ...evidence, label: "other" })).toBe(false);
    expect(operation.observeSimulated({ ...evidence, present: false })).toBe(false);
    expect(operation.observeSimulated(evidence)).toBe(true);
    expect(operation.getSnapshot()?.items[0].state).toBe("observed");
    const disconnected = createLabelOperation();
    await disconnected.confirm(intent, targets);
    expect(disconnected.observeSimulated(evidence)).toBe(false);
    expect(disconnected.getSnapshot()?.items[0].state).toBe("not-started");
  });
});