import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createLabelOperation } from "./label-operation";
import { type MetadataEditTarget } from "./metadata-edit-execution";
import type { LabelCommand } from "./grid-commands";
import { metadataWriteFingerprint, type GridCommandResult } from "./grid-commands";
import type { Image } from "@/types/image";
import { acceptImageOverlay, acceptImageRead, admitLabelObservation, captureImageRead, hasImageCommandConflict, isLabelAuthorityCurrent, recordImageAvailability, releaseLabelObservation, resetImageFreshnessForTests, resolveImageOverlay, stampImageRead, watchQueuedLabelTargets } from "./image-read-freshness";
import { attachEnrichment } from "@/stores/enrichment-store";
import { createMetadataOperation } from "./metadata-operation";
import { metadataSaveStatus } from "@/stores/metadata-editor-store";
import { leaseSetKey } from "./lease-change";
import { BATCH_POLICY } from "./batch-execution";

const resource = { links: [{ rel: "edits", href: "https://metadata.example.test/metadata/first" }] };
const intent = { action: "add" as const, label: "news", targetIds: ["first"] };
const targets = new Map<string, MetadataEditTarget>([["first", { resource }]]);
const observedImage = (imageId = "first", label = "news"): Image => ({
  id: imageId, uploadTime: "2026-11-01T00:00:00Z", uploadedBy: "fixture",
  source: { mimeType: "image/jpeg", dimensions: { width: 400, height: 300 } },
  metadata: {}, userMetadata: { labels: [label], lastModified: "2026-11-06T00:00:00Z" },
});

beforeEach(() => { resetImageFreshnessForTests(); vi.stubEnv("VITE_USE_MEDIA_API", "true"); });
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("metadata edit execution", () => {
  it("observes only the acknowledged label prefix and stops queued work on expiry without leaving a conflict", async () => {
    const result = { outcome: "partial", status: 419, expected: { labels: ["news"] },
      labelSteps: { acknowledged: 1, rejected: 1, notSent: 0, uncertain: 0 } } as const;
    const execute = vi.fn().mockResolvedValue(result);
    const current = observedImage(), publishImages = vi.fn();
    const operation = createMetadataOperation(execute, { readImages: async () => [current], publishImages },
      { pacing: { nextStart: 0 }, dispatchConcurrency: 1 });
    try {
      await operation.confirm({ fieldId: "labels", action: "overwrite", value: [], targetIds: ["first", "next"] }, new Map([...targets, ["next", { resource }]]));
      expect(execute).toHaveBeenCalledOnce();
      expect(operation.getSnapshot()?.items).toMatchObject([{ state: "partial", observation: "observed", result }, { state: "stopped" }]);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([current]);
      const receipt = operation.getSnapshot()!;
      const summary = metadataSaveStatus({ id: 1, intent: receipt.intent, items: receipt.items, state: "finished", excluded: 0 });
      expect(summary).toContain("0/2 visible");
      expect(summary).toContain("1 acknowledged");
      expect(summary).toContain("1 rejected");
      expect(hasImageCommandConflict("first")).toBe(false);
    } finally { operation.stopRemaining(); operation.cancelObservation(); }
  });
  it("retains shared capacity reservations until every queued owner releases them", () => {
    recordImageAvailability(Array.from({ length: BATCH_POLICY.maxTouchedImages - 1 }, (_, index) => `unavailable-${index}`), "unavailable");
    const first = watchQueuedLabelTargets(["shared"])!;
    const second = watchQueuedLabelTargets(["shared"])!;
    first(); first();
    expect(watchQueuedLabelTargets(["another"])).toBeUndefined();
    second();
    const available = watchQueuedLabelTargets(["another"]);
    expect(available).toBeTypeOf("function");
    available?.();
  });

  it("publishes metadata only after the command's exact expected fields become visible", async () => {
    vi.useFakeTimers();
    const stale = { ...observedImage(), metadata: { credit: "Earlier credit", city: "Keep city" } };
    const current = { ...observedImage(), metadata: { credit: "New credit", city: "Keep city" },
      userMetadata: { lastModified: "2026-11-06T00:01:00Z" } };
    const execute = vi.fn().mockResolvedValue({ outcome: "unknown", expected: { credit: "New credit" } });
    const publishImages = vi.fn();
    const operation = createMetadataOperation(execute, {
      readImages: vi.fn().mockResolvedValueOnce([stale]).mockResolvedValue([current]), publishImages,
    });
    try {
      await operation.confirm({ fieldId: "metadata_credit", action: "overwrite", value: "New credit", targetIds: ["first"] }, targets);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([current]);
      expect(operation.getSnapshot()?.items).toMatchObject([{ state: "unknown", observation: "observed" }]);
      expect(execute).toHaveBeenCalledOnce();
    } finally { operation.stopRemaining(); operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("waits for subject order as well as membership before confirming the edit", async () => {
    vi.useFakeTimers();
    const stale = { ...observedImage(), metadata: { subjects: ["news", "sport"] } };
    const current = { ...observedImage(), metadata: { subjects: ["sport", "news"] } };
    const publishImages = vi.fn();
    const operation = createMetadataOperation(async () => ({ outcome: "acknowledged", expected: current.metadata }), {
      readImages: vi.fn().mockResolvedValueOnce([stale]).mockResolvedValue([current]), publishImages,
    });
    try {
      await operation.confirm({ fieldId: "metadata_subjects", action: "add", value: "news", targetIds: ["first"] }, targets);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([current]);
    } finally { operation.stopRemaining(); operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("settles rejected and superseded recipients without waiting for an unrelated peer", async () => {
    vi.useFakeTimers();
    const ids = ["first", "denied", "slow"];
    const release = watchQueuedLabelTargets(ids)!;
    const current = { ...observedImage(), metadata: { credit: "new" }, userMetadata: { metadata: { credit: "new" } } };
    const readImages = vi.fn().mockResolvedValue([]);
    const older = createMetadataOperation(async command => command.imageId === "denied" ? { outcome: "rejected", status: 403, errorKey: "permission-denied" }
      : { outcome: "acknowledged", expected: { credit: "old" }, metadataWitness: metadataWriteFingerprint({ credit: "old" }) }, { readImages, publishImages: vi.fn() });
    const newer = createMetadataOperation(async () => ({ outcome: "acknowledged", expected: { credit: "new" }, metadataWitness: metadataWriteFingerprint({ credit: "new" }) }),
      { readImages: async () => [current], publishImages: vi.fn() });
    const edit = { fieldId: "metadata_credit", action: "overwrite" } as const;
    try {
      await older.confirm({ ...edit, value: "old", targetIds: ids }, new Map(ids.map(id => [id, { resource }])));
      const grant = { resource: structuredClone(resource) };
      stampImageRead(observedImage(), grant, captureImageRead(), "lean");
      acceptImageOverlay("first", grant);
      await newer.confirm({ ...edit, value: "new", targetIds: ["first"] }, new Map([["first", grant]]));
      expect(newer.getSnapshot()?.items[0].observation).toBe("observed");
      readImages.mockResolvedValue([current]);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
      expect(older.getSnapshot()?.items.map(item => item.observation)).toEqual(["superseded", "unavailable", "pending"]);
    } finally { older.cancelObservation(); newer.cancelObservation(); release(); vi.useRealTimers(); }
  });

  it.each([true, false])("sends only this image's overwrite decision (%s) and observes an uncertain lease addition without replay", async overwrite => {
    vi.useFakeTimers();
    const lease = { access: "allow-syndication" } as const;
    const current = { ...observedImage(), leases: { leases: [lease] } };
    const execute = vi.fn().mockResolvedValue({ outcome: "unknown", expectedLeases: leaseSetKey([lease]) });
    const publishImages = vi.fn();
    const operation = createMetadataOperation(execute, {
      readImages: vi.fn().mockResolvedValueOnce([{ ...current, leases: { leases: [] } }]).mockResolvedValue([current]), publishImages,
    });
    try {
      const leaseId = "23a47def-4fea-44bb-b706-30bd5e145f31";
      await operation.confirm({ fieldId: "leases", action: "overwrite", value: { kind: "add", lease, approvedLeaseIds: { [overwrite ? "first" : "other"]: leaseId } }, targetIds: ["first"] }, targets);
      expect(execute).toHaveBeenCalledExactlyOnceWith({ operation: "edit-leases", resource, imageId: "first", value: { kind: "add", lease, approvedLeaseId: overwrite ? leaseId : undefined } });
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([current]);
      expect(operation.getSnapshot()?.items).toMatchObject([{ state: "unknown", observation: "observed" }]);
      expect(execute).toHaveBeenCalledOnce();
    } finally { operation.stopRemaining(); operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("keeps observed collections and their grants separate from newer metadata on stale projections", async () => {
    const first = "2026-11-06T00:01:00Z", later = "2026-11-06T00:02:00Z";
    const read = (paths: string[], lastModified: string, credit = "old") => {
      const image = { ...observedImage(), collections: paths.map(pathId => ({ pathId })), lastModified,
        metadata: { credit }, userMetadata: { lastModified: credit === "old" ? first : later } };
      const overlay = { resource: structuredClone(resource), valid: credit === "old", removableCollections: new Set(paths),
        actions: [{ name: "add-collection", method: "POST" as const, href: "/collections" }, { name: "other", method: "GET" as const, href: "/other" }] };
      attachEnrichment(image, overlay);
      stampImageRead(image, overlay, captureImageRead(), "lean");
      return { image, overlay };
    };
    const confirm = async (paths: string[], credit: string) => {
      const operation = createMetadataOperation(async () => ({ outcome: "acknowledged", expected: { collections: paths } }), {
        readImages: async () => [read(paths, first, credit).image], publishImages: vi.fn(),
      });
      try {
        const grant = read(paths.length ? [] : ["news"], first, credit).overlay;
        await operation.confirm({ fieldId: "collections", action: paths.length ? "add" : "remove", value: ["news"], targetIds: ["first"] },
          new Map([["first", { resource: grant.resource, collectionGrant: true }]]));
        expect(operation.getSnapshot()?.items[0]?.observation).toBe("observed");
      } finally { operation.cancelObservation(); }
    };
    const held = read(["old"], later);
    await confirm(["news"], "old");
    const current = read(["news"], first);
    expect(acceptImageRead(current.image)).toBe(current.image);
    expect(acceptImageRead(held.image, current.image)).toBe(current.image);
    const stale = read(["old"], first, "new");
    const body = acceptImageRead(stale.image, current.image)!;
    expect(body).toMatchObject({ metadata: { credit: "new" }, collections: [{ pathId: "news" }] });
    const overlay = acceptImageOverlay("first", stale.overlay, current.overlay);
    expect(overlay.valid).toBe(false);
    expect(overlay.actions?.map(action => action.name)).toEqual(["other"]);
    expect(overlay.removableCollections?.has("old")).not.toBe(true);
    expect(resolveImageOverlay(body, stale.overlay)?.removableCollections?.has("old")).not.toBe(true);
    await confirm([], "new");
    expect(acceptImageRead(read(["news"], first, "new").image)?.collections).toEqual([]);
    const external = read(["external"], later, "new");
    expect(acceptImageOverlay("first", external.overlay)).toBe(external.overlay);
    expect(acceptImageRead(read([], first, "new").image)?.collections).toEqual(external.image.collections);
    expect(acceptImageRead(read(["external"], later, "new").image)?.collections).toEqual(external.image.collections);
  });

  it.each([true, false])("fences later lease bodies and overlays until newer evidence or a confirmed clear (versioned: %s)", async versioned => {
    const lease = { id: "first-lease", access: "allow-use" } as const;
    const timestamp = "2026-11-06T00:01:00Z";
    const read = (leases: Image["leases"]) => {
      const image = { ...observedImage(), leases };
      const overlay = { resource: structuredClone(resource), leasesSummary: { currentCount: leases?.leases?.length ?? 0, inactiveCount: 0, hasActiveAllowLease: false } };
      attachEnrichment(image, overlay);
      stampImageRead(image, overlay, captureImageRead(), "full");
      return { image, overlay };
    };
    const confirm = async (records: typeof lease[]) => {
      const grant = read({ leases: [lease], lastModified: versioned ? timestamp : undefined });
      acceptImageOverlay("first", grant.overlay);
      const operation = createMetadataOperation(async () => ({ outcome: "acknowledged", expectedLeases: leaseSetKey(records) }), {
        readImages: async () => [read({ leases: records, lastModified: versioned ? (records.length ? timestamp : "2026-11-06T00:00:30Z") : undefined }).image], publishImages: vi.fn(),
      });
      try {
        await operation.confirm({ fieldId: "leases", action: "overwrite", value: { kind: "replace", leases: records.map(({ access }) => ({ access })) }, targetIds: ["first"] }, new Map([["first", grant.overlay]]));
        expect(operation.getSnapshot()?.items[0].observation).toBe("observed");
      } finally { operation.cancelObservation(); }
    };
    await confirm([lease]);
    const current = read({ leases: [lease], lastModified: versioned ? timestamp : undefined });
    expect(acceptImageRead(current.image)).toBe(current.image);
    expect(acceptImageOverlay("first", current.overlay)).toBe(current.overlay);
    for (const lastModified of versioned ? ["2026-11-06T00:00:00Z", timestamp, undefined] : [undefined]) {
      const stale = read({ leases: [], lastModified });
      expect(acceptImageRead(stale.image, current.image)).toBe(current.image);
      expect(acceptImageRead(stale.image, stale.image)).toBeUndefined();
      expect(acceptImageOverlay("first", stale.overlay, current.overlay)).toBe(current.overlay);
      expect(resolveImageOverlay(current.image, current.overlay, stale.overlay)).toBe(current.overlay);
    }
    await confirm([]);
    expect(acceptImageRead(read({ leases: [lease], lastModified: versioned ? timestamp : undefined }).image)).toBeUndefined();
    if (versioned) {
      const newer = read({ leases: [lease], lastModified: "2026-11-06T00:02:00Z" });
      expect(acceptImageRead(newer.image)).toBe(newer.image);
      expect(acceptImageOverlay("first", newer.overlay)).toBe(newer.overlay);
      expect(acceptImageRead(read({ leases: [], lastModified: timestamp }).image, newer.image)).toBe(newer.image);
    }
  });

  it.each(["deadline", "failed", "exhausted"])("preserves Byline authority when an older standalone Credit read ends (%s)", async end => {
    vi.useFakeTimers();
    const credit = { ...observedImage(), metadata: { credit: "A" } };
    const byline = { ...observedImage(), metadata: { credit: "A", byline: "B" } };
    const creditGrant = { resource: structuredClone(resource) };
    const bylineGrant = { resource: structuredClone(resource) };
    attachEnrichment(credit, creditGrant);
    attachEnrichment(byline, bylineGrant);
    let release!: (image: Image | undefined) => void;
    const owner = { imageId: credit.id, isCurrent: () => true, unavailable: vi.fn(),
      read: vi.fn(() => new Promise<Image | undefined>(resolve => { release = resolve; })) };
    const earlier = createMetadataOperation(async () => ({ outcome: "acknowledged", expected: { credit: "A" } }),
      { readImages: async () => [credit], publishImages: vi.fn(), standalone: () => owner });
    const later = createMetadataOperation(async () => ({ outcome: "acknowledged", expected: { byline: "B" } }),
      { readImages: async () => [byline], publishImages: vi.fn() });
    try {
      await earlier.confirm({ fieldId: "metadata_credit", action: "overwrite", value: "A", targetIds: [credit.id] }, targets);
      expect(owner.read).toHaveBeenCalledOnce();
      const heldFull = { ...credit };
      stampImageRead(heldFull, undefined, captureImageRead(), "full");
      await later.confirm({ fieldId: "metadata_byline", action: "overwrite", value: "B", targetIds: [credit.id] }, new Map([[credit.id, creditGrant]]));
      expect(later.getSnapshot()?.items[0].observation).toBe("observed");
      if (end === "failed") release(undefined);
      if (end === "exhausted") release(heldFull);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationWindowMs);
      expect(owner.unavailable).not.toHaveBeenCalled();
      expect(earlier.getSnapshot()?.items[0].observation).toBe("superseded");
      expect(owner.read).toHaveBeenCalledOnce();
      expect(isLabelAuthorityCurrent(credit.id, bylineGrant.resource)).toBe(true);
    } finally { release?.(undefined); earlier.cancelObservation(); later.cancelObservation(); vi.useRealTimers(); }
  });

  it("does not reactivate a captured label grant left unresolved by an intervening edit", async () => {
    let activate!: () => void;
    const execute = vi.fn().mockResolvedValue({ outcome: "unknown" });
    const waiting = createLabelOperation(execute, undefined, "connected", {
      wait: new Promise<void>(resolve => { activate = resolve; }), pacing: { nextStart: 0 },
    });
    const done = waiting.confirm(intent, targets);
    const intervening = createLabelOperation(async () => ({ outcome: "acknowledged" }), {
      readImages: async () => [observedImage()], publishImages: vi.fn(),
    });
    await intervening.confirm(intent, targets);
    activate();
    await done;
    expect(waiting.getSnapshot()?.blocked).toBe("capabilities");
    expect(execute).not.toHaveBeenCalled();
  });

  it("refuses a queued label when the standalone full result withdraws its lean grant", async () => {
    const lean = observedImage();
    const grant = { resource: structuredClone(resource) };
    attachEnrichment(lean, grant);
    const full = observedImage();
    const denied = { resource: { links: [] } };
    let finishFull!: () => void;
    const owner = { imageId: lean.id, isCurrent: () => true, unavailable: vi.fn(),
      read: () => new Promise<Image>(resolve => {
        stampImageRead(full, denied, captureImageRead(), "full");
        attachEnrichment(full, denied);
        finishFull = () => resolve(full);
      }) };
    const first = createLabelOperation(async () => ({ outcome: "acknowledged" }), {
      readImages: async () => [lean], publishImages: vi.fn(), standalone: () => owner,
    }, "connected");
    let activate!: () => void;
    const execute = vi.fn().mockResolvedValue({ outcome: "rejected" });
    const waiting = createLabelOperation(execute, undefined, "connected", {
      wait: new Promise<void>(resolve => { activate = resolve; }), pacing: { nextStart: 0 },
    });
    try {
      await first.confirm(intent, targets);
      const done = waiting.confirm({ ...intent, label: "later" }, new Map([[lean.id, grant]]));
      finishFull();
      await Promise.resolve();
      expect(first.getSnapshot()?.items[0].observation).toBe("observed");
      activate();
      await done;
      expect(waiting.getSnapshot()?.blocked).toBe("capabilities");
      expect(execute).not.toHaveBeenCalled();
    } finally { finishFull?.(); activate(); first.cancelObservation(); }
  });

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

  it.each(["connected", "simulated"] as const)("keeps observing after a matching read is rejected as stale (%s)", async mode => {
    vi.useFakeTimers();
    const baseline = observedImage("first", "other");
    const stale = observedImage();
    stale.userMetadata!.lastModified = "2026-11-05T00:00:00Z";
    const current = observedImage();
    current.userMetadata!.lastModified = "2026-11-07T00:00:00Z";
    const readImages = vi.fn().mockImplementationOnce(async () => {
      stampImageRead(baseline, undefined, captureImageRead(), "lean");
      expect(acceptImageRead(baseline)).toBe(baseline);
      return [stale];
    }).mockResolvedValue([current]);
    const execute = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const publishImages = vi.fn();
    const operation = createLabelOperation(execute, { readImages, publishImages }, mode);
    try {
      await operation.confirm(intent, targets);
      await vi.advanceTimersByTimeAsync(0);
      expect(publishImages).not.toHaveBeenCalled();
      expect(operation.getSnapshot()?.items[0].observation).toBe("pending");
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([current]);
      expect(operation.getSnapshot()?.items[0].observation).toBe("observed");
      expect(execute).toHaveBeenCalledOnce();
    } finally { operation.cancelObservation(); vi.useRealTimers(); }
  });

  it("observes 100 targets including visibility delayed after the last acknowledgement", async () => {
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
      await vi.advanceTimersByTimeAsync((ids.length - 1) * BATCH_POLICY.speed.startIntervalMs + 3_999);
      expect(operation.getSnapshot()?.items.filter(item => item.observation === "observed")).toHaveLength(99);
      expect(operation.getSnapshot()?.items.at(-1)?.observation).toBe("pending");
      await vi.advanceTimersByTimeAsync(1);
      await completion;
      expect(executor.mock.calls.map(([command]) => command.imageId)).toEqual(ids);
      expect(operation.getSnapshot()?.items.every(item => item.state === "accepted-awaiting-visibility" && item.observation === "observed")).toBe(true);
      expect(readImages).toHaveBeenCalledTimes(9);
      expect(readImages.mock.calls.at(-1)?.[0]).toEqual([ids.at(-1)]);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationWindowMs);
      expect(readImages).toHaveBeenCalledTimes(9);
    } finally { operation.stopRemaining(); operation.cancelObservation(); await completion; vi.useRealTimers(); }
  });

  it("bounds connected readback by the deadline without replaying writes", async () => {
    vi.useFakeTimers();
    const ids = ["first", "second"];
    const executor = vi.fn().mockResolvedValue({ outcome: "acknowledged" });
    const readImages = vi.fn().mockResolvedValue([]);
    const publishImages = vi.fn();
    const operation = createLabelOperation(executor, { readImages, publishImages }, "connected");
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.speed.startIntervalMs + BATCH_POLICY.observationWindowMs - 1);
      expect(operation.getSnapshot()?.items.every(item => item.observation === "pending")).toBe(true);
      expect(readImages).toHaveBeenCalledTimes(20);
      await vi.advanceTimersByTimeAsync(1);
      await completion;
      expect(operation.getSnapshot()?.items).toMatchObject(ids.map(imageId => ({ imageId,
        state: "accepted-awaiting-visibility", observation: "deadline" })));
      expect(readImages.mock.calls.at(-1)?.[1].aborted).toBe(true);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationWindowMs);
      expect(readImages).toHaveBeenCalledTimes(20);
      expect(executor).toHaveBeenCalledTimes(2);
      expect(publishImages).not.toHaveBeenCalled();
    } finally { operation.stopRemaining(); operation.cancelObservation(); await completion; vi.useRealTimers(); }
  });

  it("delays unsent commands after throttling without replaying the uncertain command", async () => {
    vi.useFakeTimers();
    const executor = vi.fn().mockResolvedValueOnce({ outcome: "unknown", status: 429 })
      .mockResolvedValue({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
    const operation = createLabelOperation(executor, undefined, "connected");
    const ids = Array.from({ length: 9 }, (_, index) => `target-${index}`);
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(999);
      expect(executor).toHaveBeenCalledTimes(8);
      await vi.advanceTimersByTimeAsync(1);
      expect(executor).toHaveBeenCalledTimes(9);
      await completion;
      expect(executor.mock.calls.map(call => call[0].imageId)).toEqual(ids);
      expect(operation.getSnapshot()?.items.map(item => item.state)).toEqual(["unknown", ...ids.slice(1).map(() => "rejected")]);
    } finally { operation.stopRemaining(); await completion; vi.useRealTimers(); }
  });

  it("bounds immediate connected dispatch without changing captured targets", async () => {
    vi.useFakeTimers();
    const starts: number[] = [];
    const releases: ((result: GridCommandResult) => void)[] = [];
    const executor = vi.fn((_command: LabelCommand) => {
      starts.push(Date.now());
      return new Promise<GridCommandResult>(resolve => releases.push(resolve));
    });
    const operation = createLabelOperation(executor, undefined, "connected");
    const ids = Array.from({ length: 10 }, (_, index) => `target-${index}`);
    const input = { ...intent, targetIds: [...ids] };
    const releaseReservation = watchQueuedLabelTargets(ids)!;
    const completion = operation.confirm(input, new Map(input.targetIds.map(imageId => [imageId, { resource }])));
    try {
      input.targetIds.splice(0, ids.length, "changed");
      await vi.advanceTimersByTimeAsync(0);
      expect(executor).toHaveBeenCalledTimes(8);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(executor).toHaveBeenCalledTimes(8);
      releases[0]({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
      await vi.advanceTimersByTimeAsync(0);
      expect(executor).toHaveBeenCalledTimes(9);
      expect(starts[1] - starts[0]).toBe(0);
      expect(executor.mock.calls.map(call => call[0].imageId)).toEqual(ids.slice(0, 9));
      const denied = { resource: { links: [] } };
      stampImageRead(observedImage(ids[9]), denied, captureImageRead(), "lean");
      acceptImageOverlay(ids[9], denied);
      releases[1]({ outcome: "unknown" });
      await vi.advanceTimersByTimeAsync(0);
      expect(executor).toHaveBeenCalledTimes(9);
      releases[2]({ outcome: "acknowledged" });
      releases[3]({ outcome: "rejected", status: 403, errorKey: "permission-denied" });
      for (const release of releases.slice(4)) release({ outcome: "acknowledged" });
      await completion;
      expect(operation.getSnapshot()?.items.map(item => item.state)).toEqual([
        "rejected", "unknown", "accepted-awaiting-visibility", "rejected",
        ...ids.slice(4, 9).map(() => "accepted-awaiting-visibility"), "not-started",
      ]);
    } finally {
      operation.stopRemaining();
      for (const release of releases) release({ outcome: "unknown" });
      await vi.runAllTimersAsync();
      await completion;
      releaseReservation();
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
    const held = Array.from({ length: 8 }, (_, index) => `held-${index}`);
    const ids = ["first", ...held, "unsent", "withdrawn"];
    const completion = operation.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    try {
      await vi.advanceTimersByTimeAsync(750);
      expect(readImages).toHaveBeenCalledExactlyOnceWith(["first"], expect.any(AbortSignal));
      expect(executor).toHaveBeenCalledTimes(9);
      const denied = { resource: { links: [] } };
      stampImageRead(observedImage("withdrawn"), denied, captureImageRead(), "lean");
      acceptImageOverlay("withdrawn", denied);
      await vi.advanceTimersByTimeAsync(119_250);
      expect(operation.getSnapshot()?.items.slice(-2).map(item => item.state)).toEqual(["stopped", "stopped"]);
      expect(executor).toHaveBeenCalledTimes(9);
      expect(operation.getSnapshot()?.items[1].observation).toBe("pending");
      await vi.advanceTimersByTimeAsync(10_000);
      expect(publishImages).toHaveBeenCalledExactlyOnceWith([observedImage()]);
      expect(operation.getSnapshot()?.items).toMatchObject([
        { state: "accepted-awaiting-visibility", observation: "observed" },
        ...held.map(() => ({ state: "submitted", observation: "deadline" })),
        { state: "stopped" },
        { state: "stopped" },
      ]);
      expect(isLabelAuthorityCurrent("unsent", resource)).toBe(true);
      expect(isLabelAuthorityCurrent("withdrawn", resource)).toBe(false);
      for (const release of releases) release({ outcome: "unknown" });
      await completion;
      expect(executor).toHaveBeenCalledTimes(9);
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
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
      expect(readImages).toHaveBeenCalledTimes(2);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
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
      const reservation = admitLabelObservation(["reserved-peer"]);
      if (typeof reservation !== "number") throw new Error("Expected second observation slot");
      const busyExecutor = vi.fn();
      const busy = createLabelOperation(busyExecutor, { readImages, publishImages });
      await busy.confirm({ ...intent, targetIds: ["busy-peer"] }, new Map([["busy-peer", { resource }]]));
      expect(busy.getSnapshot()?.blocked).toBe("busy");
      expect(busyExecutor).not.toHaveBeenCalled();
      releaseLabelObservation(reservation);
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
    executor.mockResolvedValueOnce({ outcome: "rejected", status: 419, errorKey: "authentication-expired" })
      .mockResolvedValue({ outcome: "blocked", reason: "reload-required" });
    const batch = createLabelOperation(executor, undefined, "connected");
    const active = Array.from({ length: 7 }, (_, index) => `active-${index}`);
    const ids = ["first", ...active, "unsent"];
    await batch.confirm({ ...intent, targetIds: ids }, new Map(ids.map(imageId => [imageId, { resource }])));
    expect(batch.getSnapshot()?.items.map(item => item.state)).toEqual(["rejected", ...active.map(() => "not-started"), "stopped"]);
    expect(executor).toHaveBeenCalledTimes(10);
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
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs - 1);
      expect(readImages).toHaveBeenCalledTimes(1);
      expect(publishImages).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(readImages).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(BATCH_POLICY.observationIntervalMs);
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
    for (let group = 0; group < BATCH_POLICY.maxTouchedImages / 200; group++) {
      expect((await submit(Array.from({ length: 200 }, (_, index) => `target-${group * 200 + index}`)))?.blocked).toBeUndefined();
    }
    expect(executor).toHaveBeenCalledTimes(BATCH_POLICY.maxTouchedImages);
    expect((await submit(["over-capacity"]))?.blocked).toBe("freshness-capacity");
    expect(executor).toHaveBeenCalledTimes(BATCH_POLICY.maxTouchedImages);
    expect(readImages).not.toHaveBeenCalled();
  });
});