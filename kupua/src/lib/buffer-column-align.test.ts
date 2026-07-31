import { describe, it, expect } from "vitest";
import { alignBufferStart } from "./buffer-column-align";

describe("alignBufferStart", () => {
  it.each([2, 3, 4, 5, 6])(
    "always returns an offset that is a multiple of columns=%i, given enough available items",
    (columns) => {
      for (let rawOffset = 0; rawOffset < 50; rawOffset++) {
        const { alignedOffset, trimCount } = alignBufferStart(rawOffset, 100, columns);
        expect(alignedOffset % columns, `rawOffset=${rawOffset}`).toBe(0);
        expect(trimCount).toBeGreaterThanOrEqual(0);
        expect(trimCount).toBeLessThan(columns);
        expect(alignedOffset).toBe(rawOffset + trimCount);
      }
    },
  );

  it("is a no-op when already aligned", () => {
    expect(alignBufferStart(800, 100, 4)).toEqual({ alignedOffset: 800, trimCount: 0 });
    expect(alignBufferStart(0, 100, 4)).toEqual({ alignedOffset: 0, trimCount: 0 });
  });

  it("is a no-op for columns <= 1 (table density / not yet registered)", () => {
    expect(alignBufferStart(823, 100, 1)).toEqual({ alignedOffset: 823, trimCount: 0 });
    expect(alignBufferStart(823, 100, 0)).toEqual({ alignedOffset: 823, trimCount: 0 });
  });

  it("clamps trimCount to availableCount when too few leading items exist", () => {
    // rawOffset=3, columns=4 wants trim=1, but only 0 items available.
    const result = alignBufferStart(3, 0, 4);
    expect(result).toEqual({ alignedOffset: 3, trimCount: 0 });
  });

  it("clamps trimCount to protectUpTo so the anchor item is never trimmed away", () => {
    // Ideal trim would be 3 (rawOffset=801, columns=4), plenty available,
    // but the anchor sits at local index 2 — trimming 3 would discard it.
    const result = alignBufferStart(801, 100, 4, 2);
    expect(result.trimCount).toBeLessThanOrEqual(2);
    expect(result.alignedOffset).toBe(801 + result.trimCount);
  });

  it("reproduces the exact live-repro numbers (columns=4, rawOffset=823)", () => {
    // Matches the instrumented live trace: async offset correction landed
    // bufferOffset=823 (823 % 4 === 3), which then stayed misaligned through
    // the entire scroll-mode top-up (823→623→423→223→23→3→0), all ≡3 mod 4.
    const result = alignBufferStart(823, 100, 4);
    expect(result.alignedOffset).toBe(824);
    expect(result.alignedOffset % 4).toBe(0);
    expect(result.trimCount).toBe(1);
  });
});
