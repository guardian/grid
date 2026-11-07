import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabelOperation, type LabelTarget } from "./label-operation";
import type { GridCommandResult } from "./grid-commands";
import type { Image } from "@/types/image";
import { acceptImageOverlay, captureImageRead, isLabelAuthorityCurrent, recordImageAvailability, resetImageFreshnessForTests, stampImageRead } from "./image-read-freshness";
import { attachEnrichment } from "@/stores/enrichment-store";

const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/first" }] };
const intent = { action: "add" as const, label: "news", targetIds: ["first"] };
const targets = new Map<string, LabelTarget>([["first", { resource }]]);
const observedImage = (imageId = "first", label = "news"): Image => ({
  id: imageId, uploadTime: "2026-11-01T00:00:00Z", uploadedBy: "fixture",
  source: { mimeType: "image/jpeg", dimensions: { width: 400, height: 300 } },
  metadata: {}, userMetadata: { labels: [label], lastModified: "2026-11-06T00:00:00Z" },
});

beforeEach(() => { resetImageFreshnessForTests(); vi.stubEnv("VITE_USE_MEDIA_API", "true"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("disconnected label operation", () => {
  it("nonmatching readback withdraws a post-dispatch grant", async () => {
    vi.useFakeTimers();
    const currentResource = structuredClone(resource);
    const readImages = vi.fn().mockImplementation(async () => {
      if (readImages.mock.calls.length === 1) {
        const positive = { resource: currentResource };
        stampImageRead(observedImage("first", "old"), positive, captureImageRead(), "lean");
        acceptImageOverlay("first", positive);
        expect(isLabelAuthorityCurrent("first", currentResource)).toBe(true);
      }
      const image = observedImage("first", "old");
      const denied = { resource: { links: [] }, actions: [] };
      stampImageRead(image, denied, captureImageRead(), "lean");
      attachEnrichment(image, denied);
      return [image];
    });
    const publishImages = vi.fn();
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), { readImages, publishImages });
    try {
      await operation.confirm(intent, targets);
      await vi.advanceTimersByTimeAsync(2000);
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "accepted-awaiting-visibility", observation: "deadline" });
      expect(publishImages).not.toHaveBeenCalled();
      expect(isLabelAuthorityCurrent("first", currentResource)).toBe(false);
      const executor = vi.fn();
      const subsequent = createLabelOperation(executor);
      await subsequent.confirm({ ...intent, label: "later" }, new Map([["first", { resource: currentResource }]]));
      expect(subsequent.getSnapshot()?.blocked).toBe("capabilities");
      expect(executor).not.toHaveBeenCalled();
    } finally { operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("accounts for unavailable captured targets without dispatching an eligible subset", async () => {
    const executor = vi.fn();
    const operation = createLabelOperation(executor);
    recordImageAvailability(["missing"], "unavailable");
    await operation.confirm({ ...intent, targetIds: ["first", "missing"] }, new Map([...targets, ["missing", { resource }]]));
    expect(operation.getSnapshot()).toMatchObject({ blocked: "capabilities",
      intent: { targetIds: ["first", "missing"] }, counts: { selected: 2, eligible: 1, unavailable: 1 } });
    expect(executor).not.toHaveBeenCalled();
  });
  it("publishes verified readback at the deadline without waiting for a held command", async () => {
    vi.useFakeTimers();
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn()
      .mockResolvedValueOnce({ outcome: "acknowledged" })
      .mockImplementationOnce(() => new Promise<GridCommandResult>((resolve) => { release = resolve; }));
    const image = observedImage();
    const readImages = vi.fn().mockResolvedValue([image]);
    const publishImages = vi.fn();
    const operation = createLabelOperation(executor, { readImages, publishImages });
    const completion = operation.confirm({ ...intent, targetIds: ["first", "held"] }, new Map([
      ...targets, ["held", { resource }],
    ]));
    try {
      const busyExecutor = vi.fn();
      const busy = createLabelOperation(busyExecutor, { readImages, publishImages });
      await busy.confirm({ ...intent, targetIds: ["busy-peer"] }, new Map([["busy-peer", { resource }]]));
      expect(busy.getSnapshot()?.blocked).toBe("busy");
      expect(busyExecutor).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(10_000);
      expect(readImages).toHaveBeenCalledTimes(1);
      expect(readImages.mock.calls[0][0]).toEqual(["first"]);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([image]);
      expect(operation.getSnapshot()?.items).toMatchObject([
        { imageId: "first", state: "accepted-awaiting-visibility", observation: "observed" },
        { imageId: "held", state: "submitted", observation: "deadline" },
      ]);
      const conflict = createLabelOperation(busyExecutor, { readImages, publishImages });
      const currentResource = structuredClone(resource);
      stampImageRead(observedImage("held"), { resource: currentResource }, captureImageRead(), "lean");
      await conflict.confirm({ ...intent, targetIds: ["held"] }, new Map([["held", { resource: currentResource }]]));
      expect(conflict.getSnapshot()?.blocked).toBe("conflict");
      const otherExecutor = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403 });
      const other = createLabelOperation(otherExecutor, { readImages, publishImages });
      await other.confirm({ ...intent, targetIds: ["other"] }, new Map([["other", { resource }]]));
      expect(other.getSnapshot()?.blocked).toBeUndefined();
      expect(otherExecutor).toHaveBeenCalledTimes(1);
    } finally {
      release({ outcome: "unknown" });
      await completion;
      vi.useRealTimers();
    }
    expect(executor).toHaveBeenCalledTimes(2);
    expect(readImages).toHaveBeenCalledTimes(1);
  });

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

  it.each(["acknowledged", "unknown"] as const)("observes exact canonical labels without changing the %s command outcome", async outcome => {
    vi.useFakeTimers();
    const label = 'Added to Photo Sales, literal "quoted"';
    const readImages = vi.fn()
      .mockResolvedValueOnce([observedImage("first", label.toUpperCase())])
      .mockResolvedValueOnce([observedImage("first", `${label} suffix`)])
      .mockResolvedValueOnce([observedImage("first", label)]);
    const publishImages = vi.fn();
    const operation = createLabelOperation(async () => ({ outcome }), { readImages, publishImages });
    try {
      await operation.confirm({ ...intent, label }, targets);
      await vi.advanceTimersByTimeAsync(999);
      expect(readImages).toHaveBeenCalledTimes(1);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(readImages).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(readImages).toHaveBeenCalledTimes(3);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([observedImage("first", label)]);
      expect(operation.getSnapshot()?.items[0]).toMatchObject({
        state: outcome === "unknown" ? "unknown" : "accepted-awaiting-visibility", observation: "observed", result: { outcome },
      });
      await vi.advanceTimersByTimeAsync(20_000);
      expect(readImages).toHaveBeenCalledTimes(3);
    } finally { vi.useRealTimers(); }
  });

  it.each(["failure", "deadline"] as const)("stops readback on %s and rejects actual late delivery", async reason => {
    vi.useFakeTimers();
    let release!: (images: Image[]) => void;
    let reject!: (error: Error) => void;
    const readImages = vi.fn((_ids: string[], _signal: AbortSignal) => new Promise<Image[]>((resolve, fail) => { release = resolve; reject = fail; }));
    const publishImages = vi.fn();
    const executor = vi.fn().mockResolvedValue({ outcome: "unknown" });
    const operation = createLabelOperation(executor, { readImages, publishImages });
    try {
      await operation.confirm(intent, targets);
      if (reason === "failure") reject(new Error("required read failed"));
      await vi.advanceTimersByTimeAsync(10_000);
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "unknown", observation: reason === "failure" ? "unavailable" : "deadline" });
      expect(readImages.mock.calls[0][1].aborted).toBe(true);
      release([observedImage()]);
      await vi.advanceTimersByTimeAsync(20_000);
      expect(publishImages).not.toHaveBeenCalled();
      expect(readImages).toHaveBeenCalledTimes(1);
      expect(executor).toHaveBeenCalledTimes(1);
    } finally { release([]); vi.useRealTimers(); }
  });

  it("refuses target and document-lifetime capacity overflow without truncation or dispatch", async () => {
    const readImages = vi.fn();
    const publishImages = vi.fn();
    const executor = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403 });
    const submit = async (ids: string[]) => {
      const operation = createLabelOperation(executor, { readImages, publishImages });
      const notifications = vi.fn();
      operation.subscribe(notifications);
      await operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(id => [id, { resource }])));
      expect(notifications.mock.calls.length).toBeLessThanOrEqual(4);
      return operation.getSnapshot();
    };
    expect((await submit(Array.from({ length: 201 }, (_, index) => `too-many-${index}`)))?.blocked).toBe("target-limit");
    expect(executor).not.toHaveBeenCalled();
    for (let group = 0; group < 5; group++) {
      expect((await submit(Array.from({ length: 200 }, (_, index) => `target-${group * 200 + index}`)))?.blocked).toBeUndefined();
    }
    expect(executor).toHaveBeenCalledTimes(1_000);
    expect((await submit(["over-capacity"]))?.blocked).toBe("freshness-capacity");
    expect(executor).toHaveBeenCalledTimes(1_000);
    expect(readImages).not.toHaveBeenCalled();
  });
});