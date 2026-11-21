import { describe, expect, it, vi } from "vitest";
import { Virtualizer } from "@tanstack/react-virtual";
import type { Image } from "@/types/image";
import { buildMeasuredLayout, measuredLayoutRowKey } from "./windowed-measured-layout";
import { composeUploadLayout, fixedUploadLayout, getUploadStickyInset, UPLOAD_SECTION_HEIGHT } from "./upload-section-layout";

const images = Array.from({ length: 1000 }, (_, index) => ({ id: `image-${index + 5000}` }) as Image);
const context = { bufferOffset: 5000, total: 65000, indexed: true, searchKey: "measured" };
const options = { estimatedHeight: 320, estimate: () => 320, measurements: new Map<string, number>() };

describe("bounded measured window geometry", () => {
  it("gives independently unloaded section spans unique virtualizer keys", () => {
    const layout = composeUploadLayout(images.slice(0, 200), 800, { ...context, bufferOffset: 0, total: 9000000 }, 250, true,
      (resident, scope) => buildMeasuredLayout(resident, 800, scope, options));
    expect(layout.getItemRow(0).top).toBe(0);
    const keys = Array.from({ length: layout.rowCount }, (_, index) => measuredLayoutRowKey(layout, index));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("preserves Grid columns and logical Form navigation inside an unloaded section span", () => {
    const grid = composeUploadLayout(images.slice(0, 12), 900, { ...context, bufferOffset: 250, total: 1000, indexed: false }, 250, true,
      (resident, scope) => fixedUploadLayout(resident.length, 900, 3, 100, scope.bufferOffset));
    expect(grid.spatial.neighbour(1, 1)).toBe(4);
    const shifted = fixedUploadLayout(200, 900, 3, 100, 200);
    expect(shifted.getBox(0)?.left).toBe(fixedUploadLayout(400, 900, 3, 100).getBox(200)?.left);
    const measured = composeUploadLayout(images.slice(0, 200), 800, context, 250, true,
      (resident, scope) => buildMeasuredLayout(resident, 800, scope, options));
    expect(measured.spatial.getItemRow(100).index).toBe(100);
    expect(measured.spatial.getRow(101).top - measured.spatial.getRow(100).top).toBe(320);
    const withoutBatch = composeUploadLayout(images.slice(0, 12), 800,
      { ...context, indexed: false, bufferOffset: 0, total: 12 }, 0, false,
      (resident, scope) => buildMeasuredLayout(resident, 800, scope, options));
    expect(withoutBatch.spatial.neighbour(0, -1)).toBe(0);
    expect(withoutBatch.spatial.neighbour(11, 12)).toBe(11);
  });

  it("composes section extents without catalogue-sized rows and preserves lower local positions across upper growth", () => {
    const loaded = images.slice(0, 200);
    const build = (batch: number) => composeUploadLayout(loaded, 800,
      { ...context, total: 1_000_000 + batch, bufferOffset: batch + 5000, uploadChrome: { intro: 100, batch: 40 } }, batch, true,
      (resident, scope) => buildMeasuredLayout(resident, 800, scope, options));
    const before = build(250);
    const after = build(251);
    expect(before.rowCount).toBe(203);
    expect(after.rowCount).toBe(203);
    expect(before.headers.map(header => header.section)).toEqual(["other"]);
    const chrome = { intro: 100, batch: 40 };
    const otherTop = before.headers[0].top;
    expect(getUploadStickyInset(99, chrome.intro, chrome, otherTop)).toBe(0);
    expect(getUploadStickyInset(100, chrome.intro, chrome, otherTop)).toBe(40);
    expect(getUploadStickyInset(otherTop - 40, chrome.intro, chrome, otherTop)).toBe(40 + UPLOAD_SECTION_HEIGHT);
    expect(before.getItemRow(5250).top).toBe(5250 * 320 + UPLOAD_SECTION_HEIGHT + 140);
    expect(after.getItemRow(5251).top - before.getItemRow(5250).top).toBe(320);
    expect(after.window.findItemIndex(loaded[0].id)).toBe(5251);
    expect(after.getItemRow(5252).top - after.getItemRow(5251).top).toBe(320);
  });

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