import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabelOperation, type LabelTarget } from "./label-operation";
import type { LabelCommand } from "./grid-commands";
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
  it("continues partial-coverage removal after an unchanged target and observes both images", async () => {
    vi.useFakeTimers();
    const ids = ["first", "second"];
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "unchanged" }).mockResolvedValueOnce({ outcome: "acknowledged" });
    const readImages = vi.fn(async (ids: string[]) => ids.map(id => ({ ...observedImage(id), userMetadata: { labels: [] } })));
    const operation = createLabelOperation(executor, { readImages, publishImages: vi.fn() }, "connected");
    const completion = operation.confirm({ ...intent, action: "remove", targetIds: ids }, new Map(ids.map(id => [id, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(1_000);
      await completion;
      expect(executor.mock.calls.map(([command]) => command.imageId)).toEqual(ids);
      expect(operation.getSnapshot()?.items).toMatchObject([
        { state: "unchanged", result: { outcome: "unchanged" }, observation: "observed" },
        { state: "accepted-awaiting-visibility", result: { outcome: "acknowledged" }, observation: "observed" },
      ]);
    } finally { operation.stopRemaining(); operation.cancelObservation(); await completion; vi.useRealTimers(); }
  });

  it("observes 100 paced targets including visibility delayed after the last acknowledgement", async () => {
    vi.useFakeTimers();
    const ids = Array.from({ length: 100 }, (_, index) => `batch-${index}`);
    let lastAcknowledgedAt = Infinity;
    const executor = vi.fn(async (command: LabelCommand): Promise<GridCommandResult> => {
      if (command.imageId === ids.at(-1)) lastAcknowledgedAt = Date.now();
      return { outcome: "acknowledged" };
    });
    const readImages = vi.fn(async (requested: string[]) => requested.map(id =>
      id === ids.at(-1) && Date.now() < lastAcknowledgedAt + 4_000
        ? { ...observedImage(id), userMetadata: { labels: [] } } : observedImage(id)));
    const operation = createLabelOperation(executor, { readImages, publishImages: vi.fn() }, "connected");
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(id => [id, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(35_000);
      await completion;
      expect(executor.mock.calls.map(([command]) => command.imageId)).toEqual(ids);
      expect(operation.getSnapshot()?.items.every(item => item.state === "accepted-awaiting-visibility" && item.observation === "observed")).toBe(true);
      expect(readImages).toHaveBeenCalledTimes(3);
      expect(readImages.mock.calls.at(-1)?.[0]).toEqual([ids.at(-1)]);
    } finally { operation.stopRemaining(); operation.cancelObservation(); await completion; vi.useRealTimers(); }
  });

  it("delays unsent commands after throttling without replaying the uncertain command", async () => {
    vi.useFakeTimers();
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "unknown", status: 429 })
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const operation = createLabelOperation(executor, undefined, "connected");
    const ids = ["first", "second", "third"];
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(999);
      expect(executor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(executor).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(250);
      await completion;
      expect(executor.mock.calls.map(call => call[0].imageId)).toEqual(ids);
      expect(operation.getSnapshot()?.items.map(item => item.state)).toEqual(["unknown", "rejected", "rejected"]);
    } finally { operation.stopRemaining(); await completion; vi.useRealTimers(); }
  });

  it("paces explicitly enabled connected batches without changing their captured targets", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const releases: ((result: GridCommandResult) => void)[] = [];
    const executor = vi.fn((_command: LabelCommand) => {
      starts.push(Date.now());
      return new Promise<GridCommandResult>(resolve => releases.push(resolve));
    });
    const operation = createLabelOperation(executor, undefined, "connected");
    const input = { ...intent, targetIds: ["first", "second", "third", "fourth"] };
    const completion = operation.confirm(input, new Map(input.targetIds.map(imageId => [imageId, { resource }])));
    try {
      input.targetIds.splice(0, 4, "changed");
      await vi.advanceTimersByTimeAsync(0);
      expect(executor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(249);
      expect(executor).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(executor).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(250);
      expect(executor).toHaveBeenCalledTimes(3);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(executor).toHaveBeenCalledTimes(3);
      releases[0]({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
      await vi.advanceTimersByTimeAsync(0);
      expect(executor).toHaveBeenCalledTimes(4);
      expect(starts[1] - starts[0]).toBe(250);
      expect(executor.mock.calls.map(call => call[0].imageId)).toEqual(["first", "second", "third", "fourth"]);
      releases[1]({ outcome: "unknown" });
      releases[2]({ outcome: "acknowledged" });
      releases[3]({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
      await completion;
      expect(operation.getSnapshot()?.items.map(item => item.state)).toEqual(["rejected", "unknown", "accepted-awaiting-visibility", "rejected"]);
    } finally {
      operation.stopRemaining();
      for (const release of releases) release({ outcome: "unknown" });
      await vi.runAllTimersAsync();
      await completion;
      vi.useRealTimers();
    }
  });

  it("observes completed work while flights are held and stops unsent targets at the deadline", async () => {
    vi.useFakeTimers();
    const releases: ((result: GridCommandResult) => void)[] = [];
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "acknowledged" })
      .mockImplementation(() => new Promise<GridCommandResult>(resolve => releases.push(resolve)));
    const readImages = vi.fn().mockResolvedValue([observedImage()]);
    const publishImages = vi.fn();
    const operation = createLabelOperation(executor, { readImages, publishImages }, "connected");
    const ids = ["first", "held-a", "held-b", "held-c", "unsent", "withdrawn"];
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(750);
      expect(readImages).toHaveBeenCalledExactlyOnceWith(["first"], expect.any(AbortSignal));
      expect(executor).toHaveBeenCalledTimes(4);
      const denied = { resource: { links: [] } };
      stampImageRead(observedImage("withdrawn"), denied, captureImageRead(), "lean");
      acceptImageOverlay("withdrawn", denied);
      await vi.advanceTimersByTimeAsync(119_250);
      expect(operation.getSnapshot()?.items.slice(-2).map(item => item.state)).toEqual(["stopped", "stopped"]);
      expect(executor).toHaveBeenCalledTimes(4);
      expect(operation.getSnapshot()?.items[1].observation).toBe("pending");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([observedImage()]);
      expect(operation.getSnapshot()?.items).toMatchObject([
        { state: "accepted-awaiting-visibility", observation: "observed" },
        { state: "submitted", observation: "deadline" },
        { state: "submitted", observation: "deadline" },
        { state: "submitted", observation: "deadline" },
        { state: "stopped" },
        { state: "stopped" },
      ]);
      expect(isLabelAuthorityCurrent("unsent", resource)).toBe(true);
      expect(isLabelAuthorityCurrent("withdrawn", resource)).toBe(false);
      for (const release of releases) release({ outcome: "unknown" });
      await completion;
      expect(executor).toHaveBeenCalledTimes(4);
      expect(readImages).toHaveBeenCalledTimes(1);
    } finally {
      operation.stopRemaining();
      operation.cancelObservation();
      for (const release of releases) release({ outcome: "unknown" });
      await completion;
      vi.useRealTimers();
    }
  });

  it("keeps rejected removal separate from observation and never reads or publishes it", async () => {
    const readImages = vi.fn();
    const publishImages = vi.fn();
    const executor = vi.fn().mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const operation = createLabelOperation(executor, { readImages, publishImages });
    await operation.confirm({ ...intent, action: "remove" }, targets);
    expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "rejected", observation: "unavailable" });
    expect(executor).toHaveBeenCalledTimes(1);
    expect(readImages).not.toHaveBeenCalled();
    expect(publishImages).not.toHaveBeenCalled();
  });

  it("does not observe removal from missing labels or a failed required read", async () => {
    vi.useFakeTimers();
    const readImages = vi.fn().mockResolvedValueOnce([{ ...observedImage(), userMetadata: undefined }])
      .mockRejectedValueOnce(new Error("Synthetic access failure"));
    const publishImages = vi.fn();
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), { readImages, publishImages });
    try {
      await operation.confirm({ ...intent, action: "remove" }, targets);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "accepted-awaiting-visibility", observation: "unavailable" });
      expect(publishImages).not.toHaveBeenCalled();
      expect(readImages).toHaveBeenCalledTimes(2);
    } finally { operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("retains the exact existing label and immutable target through held removal", async () => {
    vi.useFakeTimers();
    let release!: (result: GridCommandResult) => void;
    const executor = vi.fn(() => new Promise<GridCommandResult>(resolve => { release = resolve; }));
    const readImages = vi.fn();
    const publishImages = vi.fn();
    const operation = createLabelOperation(executor, { readImages, publishImages });
    const input = { action: "remove" as const, label: " news ", targetIds: ["first"] };
    const completion = operation.confirm(input, targets);
    try {
      input.targetIds[0] = "other";
      input.label = "changed";
      expect(executor).toHaveBeenCalledExactlyOnceWith({ operation: "remove-label", imageId: "first", label: " news ", resource });
      await vi.advanceTimersByTimeAsync(10_000);
      expect(operation.getSnapshot()?.intent).toEqual({ action: "remove", label: " news ", targetIds: ["first"] });
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "submitted", observation: "deadline" });
      release({ outcome: "unknown" });
      await completion;
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "unknown", observation: "deadline" });
      expect(readImages).not.toHaveBeenCalled();
      expect(publishImages).not.toHaveBeenCalled();
      expect(executor).toHaveBeenCalledTimes(1);
    } finally { operation.cancelObservation(); release({ outcome: "unknown" }); await completion; vi.useRealTimers(); }
  });

  it("observes single-image removal only from returned exact-label absence, retaining uncertainty", async () => {
    vi.useFakeTimers();
    const remaining = observedImage("first", "news suffix");
    const readImages = vi.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([observedImage()]).mockResolvedValueOnce([remaining]);
    const publishImages = vi.fn();
    const executor = vi.fn().mockResolvedValue({ outcome: "unknown" });
    const operation = createLabelOperation(executor, { readImages, publishImages });
    try {
      await operation.confirm({ ...intent, action: "remove" }, targets);
      expect(executor).toHaveBeenCalledExactlyOnceWith({ operation: "remove-label", imageId: "first", label: "news", resource });
      await vi.advanceTimersByTimeAsync(1_000);
      expect(readImages).toHaveBeenCalledTimes(2);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([remaining]);
      expect(operation.getSnapshot()?.items[0]).toMatchObject({ state: "unknown", observation: "observed" });
      expect(await operation.confirm({ ...intent, action: "remove" }, targets)).toBe(false);
      expect(executor).toHaveBeenCalledTimes(1);
    } finally { operation.cancelObservation(); vi.useRealTimers(); }
  });

  it.each(["add", "remove"] as const)("nonmatching %s readback withdraws a post-dispatch grant", async action => {
    vi.useFakeTimers();
    const currentResource = structuredClone(resource);
    const readImages = vi.fn().mockImplementation(async () => {
      if (readImages.mock.calls.length === 1) {
        const positive = { resource: currentResource };
        stampImageRead(observedImage("first", "old"), positive, captureImageRead(), "lean");
        acceptImageOverlay("first", positive);
        expect(isLabelAuthorityCurrent("first", currentResource)).toBe(true);
      }
      const image = observedImage("first", action === "remove" ? "news" : "old");
      const denied = { resource: { links: [] }, actions: [] };
      stampImageRead(image, denied, captureImageRead(), "lean");
      attachEnrichment(image, denied);
      return [image];
    });
    const publishImages = vi.fn();
    const operation = createLabelOperation(async () => ({ outcome: "acknowledged" }), { readImages, publishImages });
    try {
      await operation.confirm({ ...intent, action }, targets);
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

  it("captures immutable intent without calling a service when no executor is connected", async () => {
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
    await unsupported.confirm({ ...intent, action: "remove", targetIds: ["first", "second"] }, new Map([...targets, ["second", { resource }]]));
    expect(unsupported.getSnapshot()?.blocked).toBe("target-limit");
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
    executor.mockResolvedValueOnce({ outcome: "rejected", status: 419, errorKey: "authentication-expired" });
    const batch = createLabelOperation(executor, undefined, "connected");
    await batch.confirm({ ...intent, targetIds: ["first", "unsent"] }, new Map([...targets, ["unsent", { resource }]]));
    expect(batch.getSnapshot()?.items.map(item => item.state)).toEqual(["rejected", "stopped"]);
    expect(executor).toHaveBeenCalledTimes(3);
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