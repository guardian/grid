import { describe, expect, it, vi } from "vitest";
import { Virtualizer } from "@tanstack/react-virtual";
import type { Image } from "@/types/image";
import { buildMeasuredLayout } from "./windowed-measured-layout";

const images = Array.from({ length: 1000 }, (_, index) => ({ id: `image-${index + 5000}` }) as Image);
const context = { bufferOffset: 5000, total: 65000, indexed: true, searchKey: "measured" };
const options = { estimatedHeight: 320, estimate: () => 320, measurements: new Map<string, number>() };

describe("bounded measured window geometry", () => {
  it("keeps correction work bounded while the native extent covers the entire indexed result", () => {
    for (const total of [12000, 65000]) {
      const estimate = vi.fn(options.estimate);
      const layout = buildMeasuredLayout(images, 800, { ...context, total }, { ...options, estimate,
        measurements: new Map([[images[200].id, 457]]) });
      expect(estimate).toHaveBeenCalledTimes(999);
      expect(layout.rowCount).toBe(1002);
      expect(layout.height).toBe(total * 320 + 137);
      const estimateSize = vi.fn(index => layout.getRow(index).height);
      const virtualizer = new Virtualizer<HTMLDivElement, Element>({ count: layout.rowCount,
        estimateSize, getScrollElement: () => null, scrollToFn: () => {},
        observeElementRect: () => {}, observeElementOffset: () => {} });
      expect(virtualizer.getTotalSize()).toBe(layout.height);
      estimateSize.mockClear();
      virtualizer.measure();
      expect(virtualizer.getTotalSize()).toBe(layout.height);
      expect(estimateSize).toHaveBeenCalledTimes(1002);
      expect(layout.rowAtOffset(100 * 320)?.firstItemIndex).toBe(100);
      expect(layout.rowAtOffset(10000 * 320 + 137)?.firstItemIndex).toBe(10000);
      expect(layout.getItemRow(total - 1).top + 320).toBe(layout.height);
    }
  });

  it("retains only current-window measurements without mutating geometry needed for eviction compensation", () => {
    const old = buildMeasuredLayout(images, 800, { ...context, indexed: false }, { ...options,
      measurements: new Map([[images[0].id, 457], [images[200].id, 610], ["evicted", 900]]) });
    const next = buildMeasuredLayout(images.slice(100), 800, { ...context, indexed: false, bufferOffset: 5100 },
      { ...options, measurements: old.measurements });
    expect([...next.measurements]).toEqual([[images[200].id, 610]]);
    expect(old.getItemRow(200).top - next.getItemRow(100).top).toBe(100 * 320 + 137);
    expect(old.measurements.get(images[0].id)).toBe(457);
    expect(next.window.findItemIndex(images[200].id)).toBe(100);
  });

  it("prepares a deep seek from destination heights with headroom and a sub-row position", () => {
    const layout = buildMeasuredLayout(images, 800, context, options);
    expect(layout.window.prepareSeek({ images, bufferOffset: 500000, total: 1000000,
      backwardItemCount: 100, clampedOffset: 500100, scrollTop: 15.25, clientHeight: 720 }))
      .toEqual({ scrollTargetIndex: 100, seekSubRowOffset: 15.25 });
    expect(layout.window.prepareSeek({ images: [], bufferOffset: 0, total: 0,
      backwardItemCount: 0, clampedOffset: 0, scrollTop: 0, clientHeight: 720 }))
      .toEqual({ scrollTargetIndex: 0, seekSubRowOffset: 0 });
  });
});