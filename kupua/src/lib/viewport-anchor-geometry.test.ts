import { describe, expect, it } from "vitest";
import { electViewportAnchor, type AnchorCandidateRect } from "./viewport-anchor-geometry";

function candidate(
  id: string,
  left: number,
  top: number,
  right: number,
  bottom: number,
): AnchorCandidateRect {
  return { id, rect: { left, top, right, bottom } };
}

describe("electViewportAnchor", () => {
  it("excludes a sticky table header from usable-centre calculation", () => {
    const result = electViewportAnchor({ left: 0, top: 0, right: 800, bottom: 800 }, [
      candidate("midpoint-row", 0, 380, 800, 420),
      candidate("usable-centre-row", 0, 400, 800, 440),
    ], { usableTop: 40, verticalOnly: true });

    expect(result).toBe("usable-centre-row");
  });

  it("uses both axes for a multi-column grid", () => {
    const result = electViewportAnchor({ left: 0, top: 0, right: 900, bottom: 600 }, [
      candidate("left", 0, 250, 280, 350),
      candidate("centre", 310, 250, 590, 350),
      candidate("right", 620, 250, 900, 350),
    ]);

    expect(result).toBe("centre");
  });

  it("can choose a partially visible row when its centre is nearest", () => {
    const result = electViewportAnchor({ left: 0, top: 100, right: 600, bottom: 500 }, [
      candidate("full", 0, 170, 600, 270),
      candidate("partial", 0, 200, 600, 520),
    ], { verticalOnly: true });

    expect(result).toBe("partial");
  });

  it("preserves fractional geometry from browser zoom", () => {
    const result = electViewportAnchor({ left: 10.25, top: 20.5, right: 810.75, bottom: 621.25 }, [
      candidate("rounded-away", 10.25, 270.2, 810.75, 370.2),
      candidate("fractional-nearest", 10.25, 270.9, 810.75, 371.6),
    ], { verticalOnly: true });

    expect(result).toBe("fractional-nearest");
  });

  it("uses panel-reduced container width rather than page width", () => {
    const result = electViewportAnchor({ left: 240, top: 0, right: 840, bottom: 600 }, [
      candidate("page-centre", 250, 250, 450, 350),
      candidate("list-centre", 440, 250, 640, 350),
    ]);

    expect(result).toBe("list-centre");
  });

  it("breaks exact ties by candidate order", () => {
    const result = electViewportAnchor({ left: 0, top: 0, right: 600, bottom: 600 }, [
      candidate("first", 100, 250, 200, 350),
      candidate("second", 400, 250, 500, 350),
    ]);

    expect(result).toBe("first");
  });

  it("returns null with no rendered real-image candidates", () => {
    expect(electViewportAnchor({ left: 0, top: 0, right: 600, bottom: 600 }, [])).toBeNull();
  });

  it("ignores candidates outside usable bounds", () => {
    const result = electViewportAnchor({ left: 0, top: 0, right: 600, bottom: 600 }, [
      candidate("above", 0, -200, 600, -100),
      candidate("below", 0, 700, 600, 800),
    ]);

    expect(result).toBeNull();
  });
});