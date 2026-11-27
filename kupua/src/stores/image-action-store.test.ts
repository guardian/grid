import { expect, it, vi } from "vitest";
import { createBatchQueue } from "@/lib/batch-execution";
import type { GridCommandResult } from "@/lib/grid-commands";
import type { PreparedImageAction } from "@/lib/image-actions";
import { attachEnrichment } from "./enrichment-store";
import type { Image } from "@/types/image";
import { createImageActionStore } from "./image-action-store";

const receipt = (id: string) => ({ id: "0_0_1200_800", date: `2026-11-26T12:34:5${id.length}.000Z` });
const intent = (ids: string[], skipped: PreparedImageAction["skipped"] = []): PreparedImageAction => ({
  operation: "full-frame", label: "Crop full frame", targetIds: [...ids, ...skipped.map(item => item.id)], eligibleIds: ids, skipped,
  commands: ids.map(imageId => ({ imageId, method: "POST", resource: "crop", body: { type: "full", source: `https://api.example.test/images/${imageId}` } })),
});
function visible(id: string): Image {
  const image = { id, source: { mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 } }, uploadTime: "", uploadedBy: "", metadata: {}, exports: [{ ...receipt(id), specification: { type: "full" },
    assets: [{ mimeType: "image/jpeg", dimensions: { width: 1200, height: 800 }, file: `https://assets.example.test/${id}.jpg` }] }] } as Image;
  attachEnrichment(image, { resource: { links: [{ rel: "crops", href: `https://cropper.example.test/crops/${id}` }] } });
  return image;
}

it("keeps dispatching while acknowledged full frames await one batched visibility read", async () => {
  const ids = ["a", "bb", "ccc"];
  let reveal!: () => void;
  const revealed = new Promise<void>(resolve => { reveal = resolve; });
  let readStarted!: () => void;
  const reading = new Promise<void>(resolve => { readStarted = resolve; });
  const read = vi.fn(async (requested: string[]) => {
    readStarted();
    await revealed;
    return requested.map(visible);
  });
  const execute = vi.fn(async (command: unknown): Promise<GridCommandResult> => {
    const { imageId } = command as { imageId: string };
    if (imageId === "ccc") await reading;
    return { outcome: "acknowledged", crop: receipt(imageId) };
  });
  const store = createImageActionStore(createBatchQueue(), execute, read);

  expect(store.getState().submitFullFrame(intent(ids, [{ id: "existing", reason: "Already has a full frame" }]))).toBe(true);
  await vi.waitFor(() => expect(store.getState().fullFrameBatches[0].receipts[2].status).toBe("acknowledged"));
  expect(read).toHaveBeenCalledOnce();
  expect(read.mock.calls[0][0]).toEqual(["a", "bb"]);
  reveal();
  await vi.waitFor(() => expect(store.getState().fullFrameBatches[0].active).toBe(false));
  expect(read.mock.calls.flatMap(([requested]) => requested).sort()).toEqual(ids);
  expect(store.getState().fullFrameBatches[0].receipts.map(item => item.status)).toEqual(["saved", "saved", "saved", "skipped"]);
});

it("records throttling before releasing the edit queue to the next batch", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(1_000_000);
  try {
    const queue = createBatchQueue();
    const store = createImageActionStore(queue, async () => ({ outcome: "unknown", status: 429 }), vi.fn());
    expect(store.getState().submitFullFrame(intent(["a"]))).toBe(true);
    const later = queue.admit()!;
    await later.wait;
    expect(later.pacing.nextStart).toBe(1_001_000);
    await vi.waitFor(() => expect(store.getState().fullFrameBatches[0].active).toBe(false));
    expect(store.getState().fullFrameBatches[0].receipts).toEqual([{ id: "a", status: "uncertain" }]);
  } finally { vi.useRealTimers(); }
});
