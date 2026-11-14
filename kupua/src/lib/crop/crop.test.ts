import { describe, expect, it } from "vitest";
import { applyLegacyCropParams, getCropSettings, parseCustomRatio, subscribeCropSettings } from "./crop-options";
import { buildCropRequest, editCropRect, isValidCropRect, toOriginalRect } from "./crop-request";

class MemoryStorage implements Storage {
  private map = new Map<string, string>();
  get length() { return this.map.size; }
  clear() { this.map.clear(); }
  getItem(k: string) { return this.map.get(k) ?? null; }
  key(i: number) { return [...this.map.keys()][i] ?? null; }
  removeItem(k: string) { this.map.delete(k); }
  setItem(k: string, v: string) { this.map.set(k, v); }
}

const apply = (query: string, storage: Storage) => applyLegacyCropParams(new URLSearchParams(query), storage);

describe("legacy crop params", () => {
  it("defaults to freeform with hidden options excluded", () => {
    const s = getCropSettings(new MemoryStorage());
    expect(s.initialType).toBe("freeform");
    expect(s.lockedType).toBeUndefined();
    expect(s.options.map((o) => o.key)).toEqual(["landscape", "portrait", "video", "square", "freeform"]);
  });

  it("locks to a custom ratio named by cropType, applied in Kahuna's order", () => {
    const storage = new MemoryStorage();
    apply("cropType=longcrop&customRatio=longcrop,1,5", storage);
    const s = getCropSettings(storage);
    expect(s.lockedType).toBe("longcrop");
    expect(s.options).toEqual([{ key: "longcrop", ratio: 0.2, ratioString: "1:5" }]);
  });

  it("uses defaultCropType without locking, and invalid values clear settings", () => {
    const storage = new MemoryStorage();
    apply("defaultCropType=portrait", storage);
    expect(getCropSettings(storage)).toMatchObject({ initialType: "portrait", lockedType: undefined });
    apply("defaultCropType=nonsense", storage);
    expect(getCropSettings(storage).initialType).toBe("freeform");
  });

  it("rejects malformed custom ratios", () => {
    expect(parseCustomRatio("x,0,5")).toBeUndefined();
    expect(parseCustomRatio("x,a,5")).toBeUndefined();
    expect(parseCustomRatio(",1,5")).toBeUndefined();
    expect(parseCustomRatio("x,1junk,5")).toBeUndefined();
    expect(parseCustomRatio("x,Infinity,5")).toBeUndefined();
    expect(parseCustomRatio("x,1,5,extra")).toBeUndefined();
  });

  it("publishes subsequent option changes and keeps explicitly requested hidden ratios selectable", () => {
    const storage = new MemoryStorage();
    let notifications = 0;
    const unsubscribe = subscribeCropSettings(() => notifications++);
    try {
      apply("defaultCropType=landscape%20OLD", storage);
      expect(getCropSettings(storage).options.some(option => option.key === "landscape OLD")).toBe(true);
      apply("defaultCropType=landscape%20OLD", storage);
      expect(notifications).toBe(1);
      apply("cropType=square", storage);
      expect(getCropSettings(storage).options.map(option => option.key)).toEqual(["square"]);
      expect(notifications).toBe(2);
    } finally { unsubscribe(); }
  });
});

describe("crop request", () => {
  it("edits original-pixel coordinates with bounded movement and proportional size changes", () => {
    const rect = { x: 100, y: 100, width: 400, height: 200 };
    const size = { width: 1000, height: 600 };
    expect(editCropRect(rect, "x", 999, size, null)).toEqual({ ...rect, x: 600 });
    expect(editCropRect(rect, "y", -10, size, null)).toEqual({ ...rect, y: 0 });
    expect(editCropRect(rect, "width", 800, size, 2)).toEqual({ ...rect, width: 800, height: 400 });
    expect(editCropRect(rect, "height", 500, size, 2)).toEqual({ ...rect, width: 900, height: 450 });
    expect(editCropRect(rect, "width", 700, size, null)).toEqual({ ...rect, width: 700 });
    expect(editCropRect(rect, "width", NaN, size, null)).toEqual(rect);
  });

  it("rejects empty, non-finite and out-of-bounds selections before conversion", () => {
    const size = { width: 100, height: 50 };
    expect(isValidCropRect({ x: 0, y: 0, ...size }, size)).toBe(true);
    for (const rect of [
      { x: 0, y: 0, width: 0, height: 10 },
      { x: NaN, y: 0, width: 10, height: 10 },
      { x: 0, y: 0, width: Infinity, height: 10 },
      { x: -1, y: 0, width: 10, height: 10 },
      { x: 90, y: 0, width: 11, height: 10 },
    ]) expect(isValidCropRect(rect, size)).toBe(false);
  });

  it("scales rendition pixels to oriented-original pixels and squares jitter", () => {
    const rect = toOriginalRect({ x: 10, y: 20, width: 100, height: 100.4 }, { width: 1000, height: 500 }, { width: 4000, height: 2000 }, "square");
    expect(rect).toEqual({ x: 40, y: 80, width: 400, height: 400 });
  });

  it("clamps to the original bounds", () => {
    const rect = toOriginalRect({ x: -1, y: 0, width: 1001, height: 500 }, { width: 1000, height: 500 }, { width: 2000, height: 1000 }, "freeform");
    expect(rect).toEqual({ x: 0, y: 0, width: 2000, height: 1000 });
  });

  it("matches Kahuna's payload, omitting aspectRatio for freeform", () => {
    const rect = { x: 1, y: 2, width: 3, height: 4 };
    expect(buildCropRequest("https://api/images/abc", rect, { key: "video", ratio: 16 / 9, ratioString: "16:9" }))
      .toEqual({ type: "crop", source: "https://api/images/abc", ...rect, aspectRatio: "16:9" });
    expect(buildCropRequest("s", rect, { key: "freeform", ratio: null }).aspectRatio).toBeUndefined();
  });
});
