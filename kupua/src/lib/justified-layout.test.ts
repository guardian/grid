import { describe, expect, it } from "vitest";
import type { Image } from "@/types/image";
import { buildJustifiedLayout } from "./justified-layout";

function image(width: number, height: number, index = 0): Image {
  return { id: `fixture-${index}`, source: { dimensions: { width, height } } } as Image;
}

const images = [1.5, 0.75, 1, 3, 0.4, 6, 0.15, 2, 1, 0.6, 1.5, 1.5, 1]
  .map((ratio, index) => image(ratio * 100, 100, index));

describe("resident justified geometry", () => {
  it.each([320, 390, 600, 1120])("preserves every image and its proportions at width %s", (width) => {
    const layout = buildJustifiedLayout(images, width);
    expect(layout.boxes).toHaveLength(images.length);
    for (const [index, box] of layout.boxes.entries()) {
      // The engine returns Float32 coordinates; tolerate rounding, not changed aspect ratios.
      expect(box.width / box.height).toBeCloseTo(images[index].source.dimensions.width / 100, 5);
      expect(box.width).toBeGreaterThan(0);
      expect(box.height).toBeGreaterThan(0);
      expect(box.left).toBeGreaterThanOrEqual(0);
      expect(box.left + box.width).toBeLessThanOrEqual(width + 0.001);
      const row = layout.getItemRow(index);
      expect(row.top).toBe(box.top);
      expect(index).toBeGreaterThanOrEqual(row.firstItemIndex);
      expect(index).toBeLessThanOrEqual(row.lastItemIndex);
      if (index > row.firstItemIndex) {
        const previous = layout.boxes[index - 1];
        expect(box.left).toBeCloseTo(previous.left + previous.width + 4, 3);
      }
    }
    expect(layout).toMatchObject({ height: expect.any(Number) });
    for (const row of layout.rows) {
      expect(layout.rowAtOffset(row.top + row.height / 2)?.index).toBe(row.index);
      if (row.index > 0) {
        const previous = layout.getRow(row.index - 1);
        expect(row.top).toBeCloseTo(previous.top + previous.height, 6);
      }
    }
  });

  it("uses oriented dimensions and stable square fallback without image decoding", () => {
    const oriented = image(600, 400);
    oriented.source.orientedDimensions = { width: 400, height: 600 };
    const layout = buildJustifiedLayout([oriented, image(0, 100), image(NaN, 100)], 1000);
    expect(layout.boxes[0].aspectRatio).toBeCloseTo(2 / 3);
    expect(layout.boxes.slice(1).map(box => box.aspectRatio)).toEqual([1, 1]);
  });

  it("keeps an incomplete final row instead of hiding it", () => {
    const layout = buildJustifiedLayout([image(100, 100)], 1120);
    expect(layout.boxes).toHaveLength(1);
    expect(layout.boxes[0].width).toBeLessThan(1120);
  });

  it("handles empty results and refuses missing image geometry", () => {
    const layout = buildJustifiedLayout([], 400);
    expect(layout.rows).toEqual([]);
    expect(layout.rowAtOffset(0)).toBeUndefined();
    expect(() => layout.getItemRow(0)).toThrow("Justified geometry is not ready");
  });

  it("selects the nearest horizontal centre in the requested row", () => {
    const layout = buildJustifiedLayout(images, 600);
    for (const [index, box] of layout.boxes.entries()) {
      const row = layout.getItemRow(index);
      const nextRow = layout.rows[Math.min(layout.rows.length - 1, row.index + 1)];
      const centre = box.left + box.width / 2;
      const candidates = layout.boxes.slice(nextRow.firstItemIndex, nextRow.lastItemIndex + 1)
        .map((candidate, offset) => ({ index: nextRow.firstItemIndex + offset,
          distance: Math.abs(candidate.left + candidate.width / 2 - centre) }))
        .sort((a, b) => a.distance - b.distance || a.index - b.index);
      expect(layout.neighbour(index, nextRow.index)).toBe(candidates[0].index);
    }
  });
});
