import { beforeEach, describe, expect, it } from "vitest";
import { useZoomStore } from "./zoom-store";

describe("zoom store", () => {
  beforeEach(() => {
    useZoomStore.setState({ justifiedOffset: 0, gridOffset: 0, ranges: { justified: [-2, 3], grid: [-3, 2] } });
  });

  it("steps the given density only, clamps to the registered range, ignores table, resets to 0", () => {
    const { step, reset } = useZoomStore.getState();
    step("justified", 1);
    expect(useZoomStore.getState()).toMatchObject({ justifiedOffset: 1, gridOffset: 0 });
    for (let i = 0; i < 10; i++) step("justified", 1);
    expect(useZoomStore.getState().justifiedOffset).toBe(3);
    for (let i = 0; i < 10; i++) step("grid", -1);
    expect(useZoomStore.getState().gridOffset).toBe(-3);
    step("table", 1);
    expect(useZoomStore.getState().gridOffset).toBe(-3);
    reset("justified");
    expect(useZoomStore.getState().justifiedOffset).toBe(0);
  });

  it("re-clamps the current offset when the range shrinks (e.g. desktop → phone)", () => {
    useZoomStore.getState().step("grid", 2);
    useZoomStore.getState().setRange("grid", [-5, 0]);
    expect(useZoomStore.getState().gridOffset).toBe(0);
  });
});
