// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { Image } from "@/types/image";

vi.mock("@/lib/grid-api-instance", () => ({ isGridSessionInvalidated: () => false }));
vi.mock("@/lib/image-publication", () => ({ publishImages: vi.fn(), hasNewerImageCopy: () => false, tagStandalonePublication: <T,>(result: T) => result }));
const read = vi.hoisted(() => vi.fn());
vi.mock("@/dal/grid-api-search-adapter", () => ({ apiGetImage: read, SearchAfterApiError: class extends Error {} }));

afterEach(() => { vi.useRealTimers(); read.mockReset(); });

const frame = { version: 1 as const, imageId: "A", size: { width: 1200, height: 800 }, cropKey: "freeform", ratio: null,
  rect: { x: 0, y: 0, width: 600, height: 400 } };
const withExport = (date: string): { image: Image; enrichment: object } => ({
  image: { id: "A", uploadTime: "", uploadedBy: "", metadata: {}, source: { mimeType: "image/jpeg", dimensions: frame.size },
    exports: [{ id: "0_0_600_400", date, assets: [{ mimeType: "image/jpeg", dimensions: { width: 600, height: 400 }, file: "/c.jpg" }] }] } as Image,
  enrichment: { resource: { links: [{ rel: "crops", href: "https://cropper.example.test/crops/A" }] } },
});

it("resumes a reloaded manual crop by reading, lands only a newer export, and gives up at its deadline", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "Date"] });
  vi.setSystemTime(1_000_000);
  sessionStorage.setItem("kupua.crop.saving", JSON.stringify([{ imageId: "A", startedAt: 1_000_000, expectedId: "0_0_600_400",
    priorDate: "2026-11-01T00:00:00.000Z", frame }]));
  const store = await import("./crop-save-store");
  const { useToastStore } = await import("./toast-store");
  const landed = vi.fn();
  store.onCropLanded("A", landed);
  read.mockResolvedValueOnce(withExport("2026-10-01T00:00:00.000Z")).mockResolvedValueOnce(withExport("2026-11-01T00:00:00.000Z"))
    .mockResolvedValueOnce(withExport("2026-11-27T00:00:00.000Z"));
  store.resumeCropSaves();
  expect(store.useCropSaveStore.getState().saves.get("A")?.phase).toBe("saving");
  await vi.advanceTimersByTimeAsync(1000);
  expect(landed).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(2000);
  expect(landed).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ image: expect.objectContaining({ id: "A" }) }), "0_0_600_400");
  expect(store.isCropBusy("A")).toBe(false);
  expect(sessionStorage.getItem("kupua.crop.saving")).toBeNull();

  sessionStorage.setItem("kupua.crop.saving", JSON.stringify([{ imageId: "A", startedAt: Date.now(), expectedId: "0_0_600_400", priorDate: null, frame }]));
  read.mockResolvedValue(undefined);
  store.resumeCropSaves();
  await vi.advanceTimersByTimeAsync(store.CROP_RESUME_MS + 30_000);
  expect(store.isCropBusy("A")).toBe(false);
  expect(useToastStore.getState().queue.at(-1)?.message).toBe("Could not confirm whether the crop was saved");
  expect(read.mock.calls.length).toBeLessThan(40);

  expect(store.beginCropSave("B")).toBe(true);
  store.finishCropSave("B", true);
  store.useCropSaveStore.setState({ saves: new Map() });
  store.resumeCropSaves();
  expect(store.beginCropSave("B")).toBe(false);
  await vi.advanceTimersByTimeAsync(2 * 60_000);
  expect(store.isCropBusy("B")).toBe(false);
});
