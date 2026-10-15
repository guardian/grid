import { describe, expect, it } from "vitest";
import type { Image } from "@/types/image";
import { buildJustifiedLayout, buildRatioLayout } from "./justified-layout";

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

  it("rebalances only the final three rows of a technical block", () => {
    const ratios = Array.from({ length: 48 }, (_, index) => index < 46 ? 1.5 : 0.67);
    const original = buildRatioLayout(ratios, 900);
    const layout = buildRatioLayout(ratios, 900, true);
    const start = original.rows.at(-3)!.firstItemIndex;
    expect(original.boxes.at(-1)!.left + original.boxes.at(-1)!.width).toBeLessThan(899);
    expect(layout.boxes.slice(0, start)).toEqual(original.boxes.slice(0, start));
    for (const row of layout.rows) {
      const last = layout.boxes[row.lastItemIndex];
      expect(last.left + last.width).toBeCloseTo(900, 3);
      expect(layout.getItemRow(row.firstItemIndex)).toEqual(row);
      expect(layout.rowAtOffset(row.top + row.height / 2)).toEqual(row);
    }
    expect(layout.rows.at(-1)!.top + layout.rows.at(-1)!.height).toBe(layout.height);
    expect(layout.boxes.map(box => box.aspectRatio)).toEqual(ratios);
  });

  it.each([10, 20])("balances a shorter tail when a %s:1 panorama makes the three-row band infeasible", panorama => {
    const ratios = [...Array<number>(42).fill(1.5), panorama, 1.5, 1.5, 1.5, 0.67, 0.67];
    const original = buildRatioLayout(ratios, 900);
    const layout = buildRatioLayout(ratios, 900, true);
    expect(original.boxes.at(-1)!.left + original.boxes.at(-1)!.width).toBeLessThan(300);
    expect(layout.boxes.slice(0, 43)).toEqual(original.boxes.slice(0, 43));
    const row = layout.getItemRow(47);
    expect([row.firstItemIndex, row.lastItemIndex]).toEqual([43, 47]);
    expect(layout.boxes.at(-1)!.left + layout.boxes.at(-1)!.width).toBeCloseTo(900, 3);
    for (let index = 43; index < 48; index++) {
      expect(layout.boxes[index].width / layout.boxes[index].height).toBeCloseTo(ratios[index], 5);
      expect(layout.boxes[index].height).toBeGreaterThanOrEqual(95);
      expect(layout.boxes[index].height).toBeLessThanOrEqual(285);
    }
  });

  it("leaves already-full blocks and infeasible extreme-ratio endings unchanged", () => {
    for (const ratios of [Array(48).fill(1.5), Array(48).fill(0.01), Array(48).fill(20)]) {
      const original = buildRatioLayout(ratios, 900);
      const layout = buildRatioLayout(ratios, 900, true);
      expect(layout.boxes).toEqual(original.boxes);
      expect(layout.rows).toEqual(original.rows);
      expect(layout.height).toBe(original.height);
    }
  });

  it("fills representative varied-ratio block ends at narrow and wide widths", () => {
    for (let seed = 1; seed <= 40; seed++) {
      let value = seed;
      const ratios = Array.from({ length: 48 }, () => {
        value = (Math.imul(value, 1664525) + 1013904223) >>> 0;
        return 0.5 + (value % 151) / 100;
      });
      for (const width of [320, 390, 900, 1720]) {
        const layout = buildRatioLayout(ratios, width, true);
        const last = layout.boxes.at(-1)!;
        expect(last.left + last.width, `seed ${seed}, width ${width}`).toBeCloseTo(width, 3);
        for (const [index, box] of layout.boxes.entries()) {
          expect(box.width / box.height).toBeCloseTo(ratios[index], 5);
          expect(box.left + box.width).toBeLessThanOrEqual(width + 0.001);
          expect(box.height).toBeGreaterThan(0);
        }
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
