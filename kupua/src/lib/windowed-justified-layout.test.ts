import { describe, expect, it } from "vitest";
import type { Image } from "@/types/image";
import { buildWindowedJustifiedLayout as build, JUSTIFIED_BLOCK_SIZE as blockSize, type LayoutWindow } from "./windowed-justified-layout";
import { alignWindowStart, windowEvictionCount, registerScrollGeometry, requireFixedRowGeometry } from "./scroll-geometry-ref";
import { buildJustifiedLayout } from "./justified-layout";

const corpus = Array.from({ length: 6000 }, (_, index) => ({ id: `photo-${index}`,
  source: { dimensions: { width: [150, 100, 75, 180][index % 4], height: 100 } } }) as Image);
const context = (indexed: boolean, bufferOffset: number, total = 6000): LayoutWindow => ({ indexed, bufferOffset, total, searchKey: "fixture" });

const seamCorpus = Array.from({ length: 6000 }, (_, index) => ({ id: `seam-${index}`,
  source: { dimensions: { width: index % blockSize === 42 ? 1000 : index % blockSize >= 46 ? 67 : [150, 100, 75, 180, 150][index % 5], height: 100 } } }) as Image);

describe("bounded windowed justified geometry", () => {
  it.each([true, false])("fills artificial block-ending rows without cropping or changing order (indexed=%s)", indexed => {
    for (const width of [320, 390, 900, 1120, 1720]) {
      const model = build(seamCorpus.slice(0, 96), width, context(indexed, 0));
      for (const end of [47, 95]) {
        const row = model.getItemRow(end);
        const last = model.getBox(end)!;
        expect(last.left + last.width, `width ${width}, block ending ${end}`).toBeCloseTo(width, 3);
        for (let index = row.firstItemIndex; index <= end; index++) {
          const box = model.getBox(index)!;
          expect(box.width / box.height).toBeCloseTo(seamCorpus[index].source.dimensions.width / 100, 5);
          expect(model.window.getItemId(index)).toBe(`seam-${index}`);
          expect(box.height).toBeGreaterThanOrEqual((width < 600 ? 130 : 190) * 0.5);
          expect(box.height).toBeLessThanOrEqual((width < 600 ? 130 : 190) * 1.5);
          if (index > row.firstItemIndex) {
            const previous = model.getBox(index - 1)!;
            expect(box.left).toBeCloseTo(previous.left + previous.width + 4, 3);
          }
        }
      }
    }
  });

  it.each([true, false])("keeps natural final rows at true result ends, including a full final block (indexed=%s)", indexed => {
    for (const count of [1, 17, 48]) {
      const images = seamCorpus.slice(0, count);
      const model = build(images, 900, context(indexed, 0, count));
      const original = buildJustifiedLayout(images, 900);
      for (let index = 0; index < count; index++) expect(model.getBox(index)).toEqual(original.getBox(index));
    }
  });

  it("does not treat an unloaded final indexed block as another artificial ending", () => {
    const model = build(seamCorpus.slice(0, 48), 1120, context(true, 0, 96));
    const square = Array.from({ length: 48 }, (_, index) => ({ id: `estimate-${index}`,
      source: { dimensions: { width: 100, height: 100 } } }) as Image);
    const original = buildJustifiedLayout(square, 1120);
    for (let index = 0; index < 48; index++) {
      const actual = model.getBox(48 + index)!;
      const expected = original.getBox(index)!;
      expect([actual.left, actual.width, actual.height]).toEqual([expected.left, expected.width, expected.height]);
    }
  });

  it.each([true, false])("preserves balanced interior geometry through middle entry, both eviction directions and resize (indexed=%s)", indexed => {
    const initial = build(seamCorpus.slice(400, 1400), 900, context(indexed, 400));
    const forward = build(seamCorpus.slice(600, 1600), 900, context(indexed, 600), initial);
    const backward = build(seamCorpus.slice(300, 1300), 900, context(indexed, 300), forward);
    for (const width of [900, 390]) {
      const reference = width === 900 ? initial : build(seamCorpus.slice(400, 1400), width, context(indexed, 400), initial);
      for (const [offset, previous] of [[600, forward], [300, backward]] as const) {
        const model = width === 900 ? previous : build(seamCorpus.slice(offset, offset + 1000), width, context(indexed, offset), previous);
        expect(model.dimensions.size).toBeLessThanOrEqual(1094);
        const baseA = reference.getBox(indexed ? 800 : 400)!;
        const baseB = model.getBox(indexed ? 800 : 800 - offset)!;
        for (let global = 700; global < 950; global++) {
          const a = reference.getBox(indexed ? global : global - 400)!;
          const b = model.getBox(indexed ? global : global - offset)!;
          expect([b.left, b.width, b.height]).toEqual([a.left, a.width, a.height]);
          expect(b.top - baseB.top).toBeCloseTo(a.top - baseA.top, 6);
          expect(model.window.getItemId(indexed ? global : global - offset)).toBe(`seam-${global}`);
        }
      }
    }
  });

  it.each([true, false])("temporary partial edges retain their balanced rows when the next data arrives (indexed=%s)", indexed => {
    const initial = build(seamCorpus.slice(0, 94), 900, context(indexed, 0));
    const appended = build(seamCorpus.slice(0, 144), 900, context(indexed, 0), initial);
    const stable = build(seamCorpus.slice(0, 140), 900, context(indexed, 0), appended);
    for (let index = 0; index < 48; index++) expect(appended.getBox(index)).toEqual(initial.getBox(index));
    for (let index = 0; index < 140; index++) expect(stable.getBox(index)).toEqual(appended.getBox(index));
    for (const end of [47, 95]) {
      const last = appended.getBox(end)!;
      expect(last.left + last.width).toBeCloseTo(900, 3);
    }
    expect(stable.dimensions.size).toBeLessThanOrEqual(140 + 94);
  });

  it.each([true, false])("keeps complete block packing across extension and eviction (indexed=%s)", indexed => {
    const first = build(corpus.slice(400, 1000), 900, context(indexed, 400));
    const second = build(corpus.slice(600, 1400), 900, context(indexed, 600), first);
    for (let global = 650; global < 950; global++) {
      const a = first.getBox(indexed ? global : global - 400)!;
      const b = second.getBox(indexed ? global : global - 600)!;
      expect([b.left, b.width, b.height]).toEqual([a.left, a.width, a.height]);
      const baseA = first.getBox(indexed ? 700 : 300)!;
      const baseB = second.getBox(indexed ? 700 : 100)!;
      expect(b.top - baseB.top).toBeCloseTo(a.top - baseA.top, 6);
    }
    expect(second.dimensions.size).toBeLessThanOrEqual(800 + 2 * (blockSize - 1));
  });

  it("anchors seek blocks by overlapping identity, not an estimated rank", () => {
    const first = build(corpus.slice(800, 1200), 390, context(false, 120000, 200000));
    const second = build(corpus.slice(760, 1160), 390, context(false, 79999, 200000), first);
    expect(second.origin).toBe(-40);
    expect(second.getBox(150)?.left).toBe(first.getBox(110)?.left);
    expect(second.window.findItemIndex("photo-910")).toBe(150);
    const replaced = build(corpus.slice(2000, 2400), 390, context(false, 79999, 200000), second);
    expect(replaced.origin).toBe(0);
    expect(replaced.dimensions.has(-1)).toBe(false);
  });

  it.each([true, false])("maps every row, image and offset without gaps or lost results (indexed=%s)", indexed => {
    const model = build(corpus.slice(47, 257), 390, context(indexed, 47, 333));
    let last = -1;
    for (let index = 0; index < model.rowCount; index++) {
      const row = model.getRow(index);
      expect(row.firstItemIndex).toBe(last + 1);
      last = row.lastItemIndex;
      for (let item = row.firstItemIndex; item <= row.lastItemIndex; item++) {
        expect(model.getItemRow(item)).toEqual(row);
        expect(model.getBox(item)?.top).toBe(row.top);
      }
      expect(model.rowAtOffset(row.top + row.height / 2)?.index).toBe(index);
      if (index) {
        const prev = model.getRow(index - 1);
        expect(prev.top + prev.height).toBeCloseTo(row.top, 6);
      }
    }
    expect(last + 1).toBe(indexed ? 333 : 210);
    expect(model.getRow(model.rowCount - 1).top + model.getRow(model.rowCount - 1).height).toBeCloseTo(model.height, 6);
  });

  it("bounds retained dimensions over long traversal and invalidates query/width correctly", () => {
    let model = build(corpus.slice(0, 1000), 1120, context(false, 0));
    for (let start = 200; start <= 5000; start += 200) {
      model = build(corpus.slice(start, start + 1000), 1120, context(false, start), model);
      expect(model.dimensions.size).toBeLessThanOrEqual(1000 + 2 * (blockSize - 1));
      expect(model.window.getItemId(0)).toBe(`photo-${start}`);
    }
    const resized = build(corpus.slice(5000, 6000), 390, context(false, 5000), model);
    expect(resized.origin).toBe(model.origin);
    expect(resized.getBox(30)?.width).not.toBe(model.getBox(30)?.width);
    const reordered = build(corpus.slice(5000, 6000).reverse(), 390, { ...context(false, 5000), searchKey: "reversed" }, resized);
    expect(reordered.origin).toBe(0);
    expect(reordered.window.getItemId(0)).toBe("photo-5999");
  });

  it("prepares estimated seeks from destination geometry without fake fixed scalars", () => {
    const model = build(corpus.slice(200, 500), 900, context(false, 200, 100000));
    const prepared = model.window.prepareSeek({ images: corpus.slice(3000, 3300), bufferOffset: 3000,
      total: 100000, backwardItemCount: 100, clampedOffset: 3100, scrollTop: 15, clientHeight: 600 });
    expect(prepared).toEqual({ scrollTargetIndex: 100, seekSubRowOffset: 15 });
    registerScrollGeometry({ layout: model, window: model.window });
    try {
      expect(alignWindowStart(403, 200)).toEqual({ alignedOffset: 403, trimCount: 0 });
      expect(windowEvictionCount(137)).toBe(137);
      expect(() => requireFixedRowGeometry({ layout: model, window: model.window })).toThrow();
    } finally { registerScrollGeometry({ columns: 1, rowHeight: 32 }); }
  });

  it("truncates a true starting block without inventing preceding images", () => {
    const first = build(corpus.slice(40, 240), 390, context(false, 40));
    const start = build(corpus.slice(0, 240), 390, context(false, 0), first);
    expect(start.origin).toBe(-40);
    expect(start.getItemRow(0).top).toBe(0);
    expect(start.getBox(0)?.left).toBe(0);
    for (let index = 40; index < 200; index++) {
      expect(start.getBox(index)?.left).toBe(first.getBox(index - 40)?.left);
    }
  });

  it("handles empty results without retaining previous dimensions", () => {
    const model = build([], 390, context(false, 0, 0));
    expect(model.height).toBe(0);
    expect(model.rowCount).toBe(0);
    expect(model.rowAtOffset(0)).toBeUndefined();
    expect(model.dimensions.size).toBe(0);
  });
});
