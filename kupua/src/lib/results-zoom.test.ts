import { describe, expect, it } from "vitest";
import {
  GRID_CLASSIC, ZOOM_STEPS, gridOffsetRange, gridRowHeight, gridSpec,
  justifiedOffsetRange, justifiedRowScale, pinchStep,
} from "./results-zoom";
import { GRID_MIN_CELL_WIDTH, GRID_ROW_HEIGHT } from "@/constants/layout";

const range = (r: [number, number]) => Array.from({ length: r[1] - r[0] + 1 }, (_, i) => r[0] + i);

describe("grid zoom ladder", () => {
  it.each([360, 400, 840, 1280, 2560])("offset 0 is the classic geometry at %ipx", (width) => {
    expect(gridSpec(0, width)).toBe(GRID_CLASSIC);
    expect(GRID_CLASSIC.minCellWidth).toBe(GRID_MIN_CELL_WIDTH);
    expect(gridRowHeight(GRID_CLASSIC, 8)).toBe(GRID_ROW_HEIGHT);
  });

  it("phones zoom out only; desktops get three smaller and two bigger steps", () => {
    expect(gridOffsetRange(400)).toEqual([-5, 0]);
    expect(gridOffsetRange(1280)).toEqual([-3, 2]);
  });

  it.each([840, 1280, 1680, 2560])("each desktop step is exactly one column at %ipx", (width) => {
    const columns = range(gridOffsetRange(width)).map((o) => Math.floor(width / gridSpec(o, width).minCellWidth));
    for (let i = 1; i < columns.length; i++) expect(columns[i - 1] - columns[i]).toBe(1);
  });
});

describe("justified zoom ladder", () => {
  it.each([320, 400, 599, 600, 1280, 2560])("offset 0 keeps the classic row height at %ipx", (width) => {
    expect(justifiedRowScale(0, width)).toBe(1);
  });

  it("desktop ladder sits one notch bigger than the phone ladder", () => {
    expect(justifiedOffsetRange(400)).toEqual([-3, 2]);
    expect(justifiedOffsetRange(1280)).toEqual([-2, 3]);
  });

  it.each([360, 400, 440, 800, 1280, 2560])("every step changes row height meaningfully at %ipx", (width) => {
    const scales = range(justifiedOffsetRange(width)).map((o) => justifiedRowScale(o, width));
    expect(scales).toHaveLength(ZOOM_STEPS);
    for (let i = 1; i < scales.length; i++) expect(scales[i] / scales[i - 1]).toBeGreaterThan(1.2);
  });

  it("largest phone step is about one landscape image per row", () => {
    expect(justifiedRowScale(2, 400) * 130).toBeCloseTo(400 / 1.5, 0);
  });
});

describe("pinchStep", () => {
  it("one step per deliberate pinch, however wide; wobbles ignored", () => {
    expect(pinchStep(1.2)).toBe(1);
    expect(pinchStep(4)).toBe(1);
    expect(pinchStep(0.1)).toBe(-1);
    expect(pinchStep(1.05)).toBe(0);
    expect(pinchStep(0.95)).toBe(0);
  });
});
